#!/usr/bin/env bun
/**
 * 简单但可靠的 namespace 转换脚本
 * 1. 移除 export namespace X { 和对应的 }
 * 2. 将内部所有 export 关键字移除（提升为模块导出）
 * 3. 在文件末尾添加 export const X = { 所有值导出 }
 * 4. 保留缩进
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * 转换单个文件
 */
function convertFile(content) {
  // 查找 export namespace X {
  const namespaceRegex = /^(export\s+namespace\s+\w+\s*\{)([\s\S]*?)^\}/m;
  const match = content.match(namespaceRegex);
  if (!match) return null;
  
  const [fullMatch, namespaceDecl, body] = match;
  // 提取命名空间名称
  const nameMatch = namespaceDecl.match(/export\s+namespace\s+(\w+)/);
  if (!nameMatch) return null;
  const namespaceName = nameMatch[1];
  
  // 计算 body 的缩进（第一非空行的前导空格）
  const bodyLines = body.split('\n');
  let indent = '';
  for (const line of bodyLines) {
    if (line.trim() === '') continue;
    const leading = line.match(/^(\s*)/);
    if (leading) {
      indent = leading[1];
      break;
    }
  }
  if (!indent) indent = '  ';
  
  // 收集值导出的名称
  const valueExports = [];
  // 处理每一行：移除 export 关键字，并记录导出名称
  const processedLines = bodyLines.map(line => {
    // 匹配 export const/function/class/let/var/async function
    const exportMatch = line.match(/^(\s*)export\s+(const|let|var|function|class|async\s+function)\s+(\w+)/);
    if (exportMatch) {
      const [, leadingSpaces, , exportName] = exportMatch;
      // 检查缩进是否匹配（确保是顶级导出）
      if (leadingSpaces === indent) {
        valueExports.push(exportName);
        // 移除 export 关键字
        return line.replace(/^(\s*)export\s+/, '$1');
      }
    }
    // 匹配 export type 和 export interface - 保留但移除 export 关键字
    const typeExportMatch = line.match(/^(\s*)export\s+(type|interface)\s+(\w+)/);
    if (typeExportMatch && typeExportMatch[1] === indent) {
      return line.replace(/^(\s*)export\s+/, '$1');
    }
    return line;
  });
  
  // 重建 body，移除缩进
  const newBody = processedLines.map(line => {
    if (line.startsWith(indent)) {
      return line.substring(indent.length);
    }
    return line;
  }).join('\n');
  
  // 替换整个 namespace
  const newContent = content.replace(fullMatch, newBody);
  
  // 添加命名空间对象导出（仅值导出）
  if (valueExports.length > 0) {
    const exportObj = `\nexport const ${namespaceName} = {\n  ${valueExports.join(',\n  ')}\n};\n`;
    // 在文件末尾添加，但在最后一个大括号之前
    const lines = newContent.split('\n');
    // 简单添加到文件末尾
    return newContent + exportObj;
  }
  
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
      const newContent = convertFile(content);
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