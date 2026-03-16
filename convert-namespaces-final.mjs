#!/usr/bin/env bun
/**
 * 将 TypeScript namespace 转换为 ES 模块（最终版）
 */

import fs from 'fs/promises';
import path from 'path';
import * as ts from 'typescript';

/**
 * 转换单个文件
 */
function convertFile(content, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  // 查找 export namespace 节点
  let namespaceNode = null;
  function visit(node) {
    if (ts.isModuleDeclaration(node) && 
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) &&
        ts.isIdentifier(node.name)) {
      namespaceNode = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!namespaceNode) {
    return null; // 没有找到
  }

  const namespaceName = namespaceNode.name.text;
  console.log(`转换 namespace: ${namespaceName}`);

  // 获取 namespace 体
  if (!ts.isModuleBlock(namespaceNode.body)) {
    console.error(`Namespace body 不是 ModuleBlock`);
    return null;
  }
  const body = namespaceNode.body;

  // 获取文本范围
  const nsStart = namespaceNode.getStart(sourceFile);
  const nsEnd = namespaceNode.getEnd();
  const bodyStart = body.getStart(sourceFile);
  const bodyEnd = body.getEnd();

  // 提取 body 内部文本
  const bodyText = content.substring(bodyStart + 1, bodyEnd - 1);

  // 计算 body 的缩进：找到第一个非空行的缩进
  const bodyLines = bodyText.split('\n');
  let bodyIndent = '';
  for (const line of bodyLines) {
    if (line.trim() === '') continue;
    const match = line.match(/^(\s*)/);
    if (match) {
      bodyIndent = match[0];
      break;
    }
  }

  // 如果没有找到缩进，默认使用 2 空格（根据代码风格）
  if (!bodyIndent) bodyIndent = '  ';

  // 处理每个语句
  const transformedStatements = [];
  const valueExportNames = [];
  const typeExportNames = [];

  for (const statement of body.statements) {
    const statementText = content.substring(
      statement.getStart(sourceFile),
      statement.getEnd()
    );
    
    // 检查是否是导出声明
    const isExported = statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const isTypeExport = ts.isTypeAliasDeclaration(statement) || 
                         ts.isInterfaceDeclaration(statement) ||
                         (ts.isExportDeclaration(statement) && statement.isTypeOnly);
    
    if (isExported) {
      // 提取导出名称
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      } else if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            valueExportNames.push(decl.name.text);
          } else if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
            // 跳过解构导出，如 export const { a, b } = obj
          }
        }
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      } else if (ts.isEnumDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      } else if (isTypeExport) {
        if (statement.name) {
          typeExportNames.push(statement.name.text);
        }
      }
      
      // 移除 export 关键字
      // 简单文本替换：移除 "export " 前缀（注意可能有 export async function）
      let newStatementText = statementText;
      if (newStatementText.startsWith('export ')) {
        newStatementText = newStatementText.substring(7); // 移除 "export "
      } else if (newStatementText.startsWith('export\t')) {
        newStatementText = newStatementText.substring(7); // 移除 "export\t"
      } else if (newStatementText.startsWith('export\n')) {
        newStatementText = newStatementText.substring(7); // 移除 "export\n"
      }
      
      // 处理 export async function
      if (newStatementText.startsWith('async ')) {
        // 保留 async
      }
      
      transformedStatements.push(newStatementText);
    } else {
      // 非导出语句，保留原样
      transformedStatements.push(statementText);
    }
  }

  // 构建新的 body 内容
  let newBodyContent = transformedStatements.join('\n');
  
  // 移除每行的 bodyIndent 缩进
  const newBodyLines = newBodyContent.split('\n');
  const dedentedLines = newBodyLines.map(line => {
    if (line.startsWith(bodyIndent)) {
      return line.substring(bodyIndent.length);
    }
    return line;
  });
  newBodyContent = dedentedLines.join('\n');

  // 构建新内容：namespace 之前的部分 + 新 body 内容 + namespace 之后的部分
  const before = content.substring(0, nsStart);
  const after = content.substring(nsEnd);
  
  let newContent = before + newBodyContent;
  
  // 添加命名空间对象导出（仅值导出）
  if (valueExportNames.length > 0) {
    // 确保新内容以换行符结尾
    if (!newContent.endsWith('\n')) newContent += '\n';
    newContent += `\nexport const ${namespaceName} = {\n`;
    newContent += valueExportNames.map(name => `  ${name}`).join(',\n');
    newContent += '\n};\n';
  }
  
  newContent += after;
  
  return newContent;
}

/**
 * 主函数
 */
async function main() {
  const srcDir = path.join(process.cwd(), 'packages', 'fanfandeagent', 'src');
  console.log(`📁 扫描目录: ${srcDir}`);
  
  // 收集所有 .ts 文件
  const files = [];
  async function collect(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collect(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  await collect(srcDir);
  console.log(`📄 找到 ${files.length} 个 TypeScript 文件`);
  
  let converted = 0;
  for (const file of files) {
    console.log(`\n🔄 处理: ${path.relative(srcDir, file)}`);
    try {
      const content = await fs.readFile(file, 'utf-8');
      const newContent = convertFile(content, file);
      if (newContent && newContent !== content) {
        // 备份原文件
        const backup = file + '.backup';
        await fs.writeFile(backup, content, 'utf-8');
        await fs.writeFile(file, newContent, 'utf-8');
        console.log(`  ✅ 已转换 (备份: ${backup})`);
        converted++;
      } else if (newContent === null) {
        console.log(`  ⏭️  未找到 export namespace，跳过`);
      } else {
        console.log(`  ⏭️  无变化`);
      }
    } catch (error) {
      console.error(`  ❌ 错误: ${error.message}`);
    }
  }
  
  console.log(`\n🎉 转换完成！共转换了 ${converted} 个文件。`);
}

if (import.meta.main) {
  main().catch(console.error);
}