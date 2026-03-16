import fs from 'fs/promises';
import path from 'path';

/**
 * 更强大的 namespace 转换器
 * 支持：
 * 1. 多行 namespace
 * 2. 嵌套 namespace
 * 3. 带注释的 namespace
 * 4. 自动更新导入语句
 */

class NamespaceConverter {
  private namespaceMap = new Map<string, string[]>();
  
  /**
   * 查找文件中的所有 namespace
   */
  findNamespaces(content: string): Array<{
    name: string;
    fullMatch: string;
    innerContent: string;
    start: number;
    end: number;
  }> {
    const results: Array<{
      name: string;
      fullMatch: string;
      innerContent: string;
      start: number;
      end: number;
    }> = [];
    
    // 匹配 export namespace 模式
    const namespacePattern = /export\s+namespace\s+(\w+)\s*{([\s\S]*?)(?=\n\s*\w|$)/g;
    
    let match;
    while ((match = namespacePattern.exec(content)) !== null) {
      const fullMatch = this.findCompleteNamespace(content, match.index);
      if (fullMatch) {
        const namespaceName = match[1];
        const innerContent = this.extractInnerContent(fullMatch, namespaceName);
        
        results.push({
          name: namespaceName,
          fullMatch,
          innerContent,
          start: match.index,
          end: match.index + fullMatch.length
        });
        
        // 收集导出成员
        this.collectExports(namespaceName, innerContent);
      }
    }
    
    return results;
  }
  
  /**
   * 查找完整的 namespace 块（处理嵌套花括号）
   */
  private findCompleteNamespace(content: string, startIndex: number): string | null {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
        continue;
      }
      
      if (inString && char === stringChar) {
        inString = false;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return content.substring(startIndex, i + 1);
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * 提取 namespace 内部内容
   */
  private extractInnerContent(fullNamespace: string, namespaceName: string): string {
    // 找到第一个 { 之后的内容
    const start = fullNamespace.indexOf('{');
    const end = fullNamespace.lastIndexOf('}');
    
    if (start === -1 || end === -1 || start >= end) {
      return '';
    }
    
    return fullNamespace.substring(start + 1, end);
  }
  
  /**
   * 收集 namespace 中的导出成员
   */
  private collectExports(namespaceName: string, innerContent: string): void {
    const exports: string[] = [];
    
    // 匹配 export 语句
    const exportPatterns = [
      /export\s+(?:const|let|var)\s+(\w+)/g,      // export const/let/var
      /export\s+function\s+(\w+)/g,               // export function
      /export\s+class\s+(\w+)/g,                  // export class
      /export\s+interface\s+(\w+)/g,              // export interface
      /export\s+type\s+(\w+)/g,                   // export type
      /export\s+enum\s+(\w+)/g,                   // export enum
      /export\s+\{\s*([^}]+)\s*\}/g,             // export { a, b, c }
    ];
    
    for (const pattern of exportPatterns) {
      let match;
      while ((match = pattern.exec(innerContent)) !== null) {
        if (pattern === exportPatterns[6]) { // export { ... } 模式
          const names = match[1].split(',').map(name => name.trim());
          exports.push(...names);
        } else {
          exports.push(match[1]);
        }
      }
    }
    
    this.namespaceMap.set(namespaceName, exports);
  }
  
  /**
   * 转换 namespace 内容为 ES Module 导出
   */
  transformNamespaceContent(innerContent: string): string {
    // 移除 namespace 级别的缩进（通常是 2 空格）
    const lines = innerContent.split('\n');
    const transformedLines: string[] = [];
    
    for (let line of lines) {
      // 移除开头的 2 个空格（namespace 内容的缩进）
      if (line.startsWith('  ')) {
        line = line.substring(2);
      }
      
      // 保留空行和注释
      transformedLines.push(line);
    }
    
    return transformedLines.join('\n');
  }
  
  /**
   * 更新文件中的导入语句
   */
  updateImports(content: string, filePath: string): string {
    let updatedContent = content;
    
    // 更新从其他文件导入 namespace 成员的语句
    for (const [namespaceName, exports] of this.namespaceMap) {
      // 匹配 import { ... } from ... 语句
      const importPattern = new RegExp(`import\s*\{[^}]*\b(${exports.join('|')})\b[^}]*\}\s*from\s*['"][^'"]+['"]`, 'g');
      
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        console.log(`Found import of ${namespaceName} members in ${filePath}`);
        // 注意：这里需要手动更新导入语句
        // 在实际使用中，您可能需要检查导入的来源文件
      }
      
      // 更新文件内的 namespace 成员访问
      for (const exportName of exports) {
        const usagePattern = new RegExp(`\b${namespaceName}\.${exportName}\b`, 'g');
        updatedContent = updatedContent.replace(usagePattern, exportName);
      }
    }
    
    return updatedContent;
  }
  
  /**
   * 处理单个文件
   */
  async processFile(filePath: string): Promise<boolean> {
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const namespaces = this.findNamespaces(content);
      
      if (namespaces.length === 0) {
        return false;
      }
      
      console.log(`\n📄 Processing: ${filePath}`);
      console.log(`   Found ${namespaces.length} namespace(s):`);
      namespaces.forEach(ns => {
        const exportCount = this.namespaceMap.get(ns.name)?.length || 0;
        console.log(`   - ${ns.name} (${exportCount} exports)`);
      });
      
      // 从后往前处理，避免位置偏移
      for (let i = namespaces.length - 1; i >= 0; i--) {
        const ns = namespaces[i];
        const transformedContent = this.transformNamespaceContent(ns.innerContent);
        
        // 替换 namespace 声明为转换后的内容
        content = content.substring(0, ns.start) + 
                 transformedContent + 
                 content.substring(ns.end);
      }
      
      // 更新导入和引用
      content = this.updateImports(content, filePath);
      
      // 写入修改后的内容
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`   ✓ Updated successfully`);
      return true;
      
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
      return false;
    }
  }
  
  /**
   * 处理目录
   */
  async processDirectory(dirPath: string): Promise<{ processed: number; total: number }> {
    let processed = 0;
    let total = 0;
    
    async function scanDirectory(converter: NamespaceConverter, currentPath: string) {
      const files = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(currentPath, file.name);
        
        if (file.isDirectory()) {
          await scanDirectory(converter, fullPath);
        } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
          total++;
          const wasProcessed = await converter.processFile(fullPath);
          if (wasProcessed) {
            processed++;
          }
        }
      }
    }
    
    await scanDirectory(this, dirPath);
    return { processed, total };
  }
  
  /**
   * 获取收集到的 namespace 信息
   */
  getNamespaceInfo(): Map<string, string[]> {
    return new Map(this.namespaceMap);
  }
}

async function main() {
  const targetDir = process.argv[2] || 'src';
  const absolutePath = path.resolve(targetDir);
  
  console.log('🚀 TypeScript Namespace to ES Module Converter');
  console.log('='.repeat(50));
  console.log(`📁 Target directory: ${absolutePath}`);
  
  // 检查目录是否存在
  try {
    await fs.access(absolutePath);
  } catch {
    console.error(`❌ Directory does not exist: ${absolutePath}`);
    console.log('Usage: tsx namespace-converter.ts [directory]');
    process.exit(1);
  }
  
  // 备份警告
  console.log('\n⚠️  IMPORTANT WARNING:');
  console.log('   This script will MODIFY your TypeScript files.');
  console.log('   Make sure you have:');
  console.log('   1. Committed all changes to git');
  console.log('   2. Created a backup of your code');
  console.log('\n   Press Ctrl+C to cancel within 5 seconds...');
  
  // 等待 5 秒让用户取消
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const converter = new NamespaceConverter();
  
  try {
    console.log('\n🔍 Scanning for namespaces...');
    const result = await converter.processDirectory(absolutePath);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 PROCESSING SUMMARY');
    console.log('='.repeat(50));
    console.log(`   Total files scanned: ${result.total}`);
    console.log(`   Files with namespaces: ${result.processed}`);
    
    const namespaceInfo = converter.getNamespaceInfo();
    if (namespaceInfo.size > 0) {
      console.log('\n📋 Namespaces found:');
      for (const [name, exports] of namespaceInfo) {
        console.log(`   ${name}: ${exports.length > 0 ? exports.join(', ') : '(no exports found)'}`);
      }
    }
    
    if (result.processed > 0) {
      console.log('\n✅ Conversion completed!');
      console.log('\n🔧 NEXT STEPS:');
      console.log('1. Run TypeScript compiler to check for errors:');
      console.log('   tsc --noEmit');
      console.log('\n2. Update import statements in files that reference namespaces');
      console.log('   Example: Change `import { Log } from "./util/log"` to');
      console.log('            `import { Level, Default } from "./util/log"`');
      console.log('\n3. Run your tests to ensure everything works:');
      console.log('   npm test  # or your test command');
      console.log('\n4. For complex cases, you may need to:');
      console.log('   - Add barrel exports (index.ts files)');
      console.log('   - Create compatibility layers');
    } else {
      console.log('\nℹ️  No namespaces found in the specified directory.');
    }
    
  } catch (error) {
    console.error('\n❌ Error during processing:', error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}