#!/usr/bin/env bun
/**
 * 使用 TypeScript AST 转换 namespace
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
  console.log(`找到 namespace: ${namespaceName}`);

  // 获取 namespace 体的语句
  if (!ts.isModuleBlock(namespaceNode.body)) {
    console.error(`Namespace body 不是 ModuleBlock`);
    return null;
  }

  const body = namespaceNode.body;
  
  // 收集值导出的名称（不包括类型导出）
  const valueExportNames = [];
  const typeExportNames = [];
  
  for (const statement of body.statements) {
    if (statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        // 类型导出
        typeExportNames.push(statement.name.text);
      } else if (ts.isFunctionDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      } else if (ts.isVariableStatement(statement)) {
        // 处理 const/let/var 导出
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            valueExportNames.push(decl.name.text);
          }
        }
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      } else if (ts.isEnumDeclaration(statement) && statement.name) {
        valueExportNames.push(statement.name.text);
      }
    }
  }

  // 获取文本范围
  const start = namespaceNode.getStart(sourceFile);
  const end = namespaceNode.getEnd();
  
  // 获取 namespace 体的大括号范围
  const bodyStart = body.getStart(sourceFile);
  const bodyEnd = body.getEnd();
  
  // 提取 namespace 体内部的内容（不包括大括号）
  const bodyText = content.substring(bodyStart + 1, bodyEnd - 1);
  
  // 计算缩进：找到 namespace 开始行的缩进
  const beforeNamespace = content.substring(0, start);
  const linesBefore = beforeNamespace.split('\n');
  const lastLine = linesBefore[linesBefore.length - 1];
  const namespaceIndent = lastLine.match(/^(\s*)/)[0];
  
  // 计算 namespace 体内容的缩进（通常比 namespace 多一层）
  const bodyFirstLine = bodyText.split('\n')[0] || '';
  const bodyIndentMatch = bodyFirstLine.match(/^(\s*)/);
  const bodyIndent = bodyIndentMatch ? bodyIndentMatch[0] : '';
  
  // 移除 body 中每行的 bodyIndent 缩进
  const bodyLines = bodyText.split('\n');
  const dedentedLines = bodyLines.map(line => {
    if (line.startsWith(bodyIndent)) {
      return line.substring(bodyIndent.length);
    }
    return line;
  });
  const newBodyText = dedentedLines.join('\n');
  
  // 构建新内容：namespace 之前的部分 + 新体内容 + namespace 之后的部分
  const before = content.substring(0, start);
  const after = content.substring(end);
  
  let newContent = before + newBodyText;
  
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
        const backup = file + '.bak2';
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