#!/usr/bin/env bun
/**
 * 使用 TypeScript 编译器 API 将 namespace 转换为 ES 模块
 */

import fs from 'fs/promises';
import path from 'path';
import * as ts from 'typescript';

/**
 * 转换单个文件
 */
function convertSourceFile(sourceFile) {
  const statements = [];
  let namespaceNode = null;
  
  // 查找 export namespace
  for (const statement of sourceFile.statements) {
    if (ts.isNamespaceExport(statement) || 
        (ts.isModuleDeclaration(statement) && 
         statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
      namespaceNode = statement;
      break;
    }
  }
  
  if (!namespaceNode) {
    // 没有找到 export namespace，返回原始内容
    return null;
  }
  
  const namespaceName = namespaceNode.name.text;
  console.log(`找到 namespace: ${namespaceName}`);
  
  // 收集 namespace 体内的语句
  const namespaceBody = namespaceNode.body;
  if (!ts.isModuleBlock(namespaceBody)) {
    console.error(`Namespace body 不是 ModuleBlock`);
    return null;
  }
  
  const exportedValues = [];
  const otherStatements = [];
  
  // 处理 namespace 内的每个语句
  for (const statement of namespaceBody.statements) {
    // 检查是否是导出声明
    if (statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // 这是一个导出声明
      // 移除 export 修饰符
      const newModifiers = statement.modifiers.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword);
      const newNode = ts.factory.updateNamespaceExport(statement, newModifiers, statement.name);
      // 暂时简单处理：将语句添加到输出中
      // 我们需要克隆这个语句，但移除 export 关键字
      // 由于 TypeScript API 复杂，我们使用文本替换
    }
    // 其他非导出语句保留
  }
  
  // 由于 TypeScript 转换 API 的复杂性，我们采用文本替换方式
  return null;
}

/**
 * 使用文本处理和简单 AST 分析进行转换
 */
function convertFileText(content, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  // 查找 export namespace
  let namespaceStart = -1;
  let namespaceEnd = -1;
  let namespaceName = '';
  
  function visit(node) {
    if ((ts.isNamespaceExport(node) || 
         (ts.isModuleDeclaration(node) && 
          node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) &&
        namespaceStart === -1) {
      namespaceStart = node.getStart(sourceFile);
      namespaceEnd = node.getEnd();
      namespaceName = node.name.text;
      return;
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  if (namespaceStart === -1) {
    return null; // 没有找到
  }
  
  console.log(`转换 namespace ${namespaceName}`);
  
  // 提取 namespace 内容
  const before = content.substring(0, namespaceStart);
  const after = content.substring(namespaceEnd);
  
  // 找到 namespace 体的大括号范围
  let bodyStart = content.indexOf('{', namespaceStart);
  let bodyEnd = -1;
  let braceCount = 0;
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0) {
      bodyEnd = i;
      break;
    }
  }
  
  if (bodyEnd === -1) {
    console.error(`无法找到匹配的大括号`);
    return null;
  }
  
  const bodyContent = content.substring(bodyStart + 1, bodyEnd);
  
  // 分析 body 内容，分离导出和非导出
  const bodySourceFile = ts.createSourceFile(
    'temp.ts',
    bodyContent,
    ts.ScriptTarget.Latest,
    true
  );
  
  const exportNames = [];
  const transformedStatements = [];
  
  function processStatement(statement, depth = 0) {
    // 检查是否是导出声明
    const isExported = statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    
    if (isExported) {
      // 提取导出名称
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        exportNames.push(statement.name.text);
      } else if (ts.isVariableStatement(statement)) {
        // 处理变量声明，如 export const schema = ...
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exportNames.push(decl.name.text);
          }
        }
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        exportNames.push(statement.name.text);
      } else if (ts.isEnumDeclaration(statement) && statement.name) {
        exportNames.push(statement.name.text);
      }
      // 移除 export 关键字
      const newModifiers = statement.modifiers?.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword) || [];
      // 由于我们只是进行文本处理，这里先简单记录
    }
    
    // 保留语句的原始文本（移除 export 关键字需要更复杂的处理）
    const statementText = bodyContent.substring(
      statement.getStart(bodySourceFile),
      statement.getEnd()
    );
    
    // 如果是有 export 关键字的语句，移除 export 关键字
    let newStatementText = statementText;
    if (isExported) {
      // 简单替换 export 关键字（注意可能有 export async function 等情况）
      newStatementText = statementText.replace(/^\s*export\s+/, '');
    }
    
    transformedStatements.push(newStatementText);
  }
  
  for (const statement of bodySourceFile.statements) {
    processStatement(statement);
  }
  
  // 重建内容
  const newBodyContent = transformedStatements.join('\n');
  
  // 移除每行前的缩进（假设为 4 空格）
  const lines = newBodyContent.split('\n');
  const dedentedLines = lines.map(line => {
    if (line.startsWith('    ')) return line.substring(4);
    if (line.startsWith('\t')) return line.substring(1);
    return line;
  });
  const finalBodyContent = dedentedLines.join('\n');
  
  // 构建新内容
  let newContent = before + finalBodyContent;
  
  // 添加 namespace 对象导出
  if (exportNames.length > 0) {
    newContent += `\n\nexport const ${namespaceName} = {\n  ${exportNames.join(',\n  ')}\n};\n`;
  } else {
    newContent += `\n\nexport const ${namespaceName} = {};\n`;
  }
  
  // 添加 after 中 namespace 结束大括号之后的部分
  const afterWithoutClosingBrace = after.substring(after.indexOf('}') + 1);
  newContent += afterWithoutClosingBrace;
  
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
      const newContent = convertFileText(content, file);
      if (newContent && newContent !== content) {
        // 备份原文件
        const backup = file + '.bak';
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