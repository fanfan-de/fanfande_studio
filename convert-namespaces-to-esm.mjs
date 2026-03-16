#!/usr/bin/env bun
/**
 * 将 TypeScript namespace 转换为 ES 模块
 * 
 * 转换规则：
 * 1. 移除 `export namespace X {` 和对应的 `}`
 * 2. 将 namespace 内部的所有导出提升到模块顶层
 * 3. 将非导出声明保留在模块作用域内
 * 4. 在文件末尾添加 `export const X = { ... }` 对象，包含所有值导出（不包括类型）
 * 
 * 注意：此脚本假设每个文件只有一个顶层 `export namespace`。
 */

import fs from 'fs/promises';
import path from 'path';
import { createSourceFile, ScriptTarget, SyntaxKind, Node, isExportAssignment, isNamespaceExport, isNamespaceDeclaration, isExportDeclaration, isVariableStatement, isFunctionDeclaration, isClassDeclaration, isInterfaceDeclaration, isTypeAliasDeclaration, isEnumDeclaration, isModuleDeclaration, isExportSpecifier, isNamedExports, isStringLiteral } from 'typescript';

/**
 * 解析文件并返回转换后的内容
 * @param {string} sourceText
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function convertFile(sourceText, filePath) {
  // 使用 TypeScript 编译器 API 解析
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  // 查找顶层 export namespace
  let namespaceName = null;
  let namespaceStart = -1;
  let namespaceEnd = -1;
  let namespaceDepth = 0;

  function visit(node, depth = 0) {
    if (ts.isNamespaceExport(node) || ts.isModuleDeclaration(node)) {
      // 检查是否是 export namespace X {
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (!namespaceName) {
          namespaceName = node.name.text;
          namespaceStart = node.getStart(sourceFile);
          namespaceEnd = node.getEnd();
          namespaceDepth = depth;
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  visit(sourceFile);

  if (!namespaceName) {
    console.log(`  ⏭️  未找到 export namespace，跳过`);
    return sourceText;
  }

  console.log(`  🔍 找到 namespace ${namespaceName}`);

  // 提取 namespace 内部内容（大括号之间的部分）
  const before = sourceText.substring(0, namespaceStart);
  const after = sourceText.substring(namespaceEnd);
  // 我们需要提取大括号内部的内容
  // 简单的方法：找到第一个 '{' 和匹配的 '}'
  let braceStart = sourceText.indexOf('{', namespaceStart);
  let braceEnd = -1;
  let braceCount = 0;
  for (let i = braceStart; i < sourceText.length; i++) {
    if (sourceText[i] === '{') braceCount++;
    if (sourceText[i] === '}') braceCount--;
    if (braceCount === 0) {
      braceEnd = i;
      break;
    }
  }
  if (braceEnd === -1) {
    console.error(`  ❌ 无法找到匹配的大括号`);
    return sourceText;
  }

  const innerContent = sourceText.substring(braceStart + 1, braceEnd);
  // 移除内部内容每行前的缩进（假设为 4 空格或 1 制表符）
  const lines = innerContent.split('\n');
  const trimmedLines = lines.map(line => {
    // 移除前导空格（最多 4 个空格或 1 个制表符）
    if (line.startsWith('    ')) return line.substring(4);
    if (line.startsWith('\t')) return line.substring(1);
    return line;
  });
  const newInnerContent = trimmedLines.join('\n');

  // 收集值导出的名称（不包括类型）
  const valueExports = [];
  // 简单正则匹配 export const/function/class
  const exportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(innerContent)) !== null) {
    valueExports.push(match[1]);
  }

  // 构建新的内容
  let newContent = before + newInnerContent;
  // 添加命名空间对象导出
  if (valueExports.length > 0) {
    newContent += `\n\nexport const ${namespaceName} = {\n  ${valueExports.join(',\n  ')}\n};\n`;
  } else {
    newContent += `\n\nexport const ${namespaceName} = {};\n`;
  }
  newContent += after.substring(after.indexOf('}', 0) + 1);

  return newContent;
}

/**
 * 主函数
 */
async function main() {
  const srcDir = path.join(process.cwd(), 'packages', 'fanfandeagent', 'src');
  console.log(`📁 扫描目录: ${srcDir}`);

  const files = await collectTypeScriptFiles(srcDir);
  console.log(`📄 找到 ${files.length} 个 TypeScript 文件`);

  for (const file of files) {
    console.log(`\n🔄 处理: ${path.relative(srcDir, file)}`);
    try {
      const content = await fs.readFile(file, 'utf-8');
      const newContent = await convertFile(content, file);
      if (newContent !== content) {
        await fs.writeFile(file, newContent, 'utf-8');
        console.log(`  ✅ 已更新`);
      } else {
        console.log(`  ⏭️  无变化`);
      }
    } catch (error) {
      console.error(`  ❌ 错误: ${error.message}`);
    }
  }

  console.log('\n🎉 转换完成！');
}

/**
 * 递归收集所有 .ts 文件（不包括 .d.ts）
 */
async function collectTypeScriptFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

if (import.meta.main) {
  main().catch(console.error);
}