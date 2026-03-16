#!/usr/bin/env bun
/**
 * 使用正则表达式将 namespace 转换为 ES 模块
 * 假设每个文件只有一个 export namespace，且没有嵌套 namespace
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * 转换单个文件
 */
function convertFile(content) {
  // 匹配 export namespace Identifier { ... }
  const namespaceRegex = /export\s+namespace\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  
  let match;
  let newContent = content;
  let converted = false;
  
  while ((match = namespaceRegex.exec(content)) !== null) {
    const [fullMatch, namespaceName, body] = match;
    console.log(`找到 namespace: ${namespaceName}`);
    
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
    
    // 移除每行的缩进
    const processedLines = bodyLines.map(line => {
      if (line.startsWith(indent)) {
        return line.substring(indent.length);
      }
      return line;
    });
    let newBody = processedLines.join('\n');
    
    // 收集值导出的名称
    const valueExportNames = [];
    // 匹配 export const/let/var/function/class/async function
    const exportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
    let exportMatch;
    while ((exportMatch = exportRegex.exec(body)) !== null) {
      valueExportNames.push(exportMatch[1]);
    }
    
    // 构建替换文本
    let replacement = newBody;
    if (valueExportNames.length > 0) {
      replacement += `\n\nexport const ${namespaceName} = {\n`;
      replacement += valueExportNames.map(name => `  ${name}`).join(',\n');
      replacement += '\n};\n';
    } else {
      replacement += `\n\nexport const ${namespaceName} = {};\n`;
    }
    
    // 替换整个 namespace
    newContent = newContent.replace(fullMatch, replacement);
    converted = true;
    break; // 只处理第一个 namespace
  }
  
  return converted ? newContent : null;
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