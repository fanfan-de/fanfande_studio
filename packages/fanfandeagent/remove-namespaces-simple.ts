import fs from 'fs/promises';
import path from 'path';

interface NamespaceMatch {
  name: string;
  fullMatch: string;
  content: string;
  start: number;
  end: number;
}

function findNamespaces(content: string): NamespaceMatch[] {
  const matches: NamespaceMatch[] = [];
  const namespaceRegex = /export\s+namespace\s+(\w+)\s*{([\s\S]*?)\n}/g;
  
  let match;
  while ((match = namespaceRegex.exec(content)) !== null) {
    matches.push({
      name: match[1],
      fullMatch: match[0],
      content: match[2],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
}

function transformNamespaceContent(namespaceContent: string): string {
  // 移除 namespace 内部的缩进（假设是 2 空格缩进）
  const lines = namespaceContent.split('\n');
  const transformedLines = lines.map(line => {
    // 移除每行开头的 2 个空格（namespace 内容的缩进）
    if (line.startsWith('  ')) {
      return line.substring(2);
    }
    return line;
  });
  
  return transformedLines.join('\n');
}

async function processFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const namespaces = findNamespaces(content);
    
    if (namespaces.length === 0) {
      return false;
    }
    
    console.log(`Found ${namespaces.length} namespace(s) in ${filePath}:`);
    namespaces.forEach(ns => {
      console.log(`  - ${ns.name}`);
    });
    
    // 从后往前处理，避免位置偏移
    let modifiedContent = content;
    for (let i = namespaces.length - 1; i >= 0; i--) {
      const ns = namespaces[i];
      const transformedContent = transformNamespaceContent(ns.content);
      
      // 替换 namespace 声明为转换后的内容
      modifiedContent = modifiedContent.substring(0, ns.start) + 
                       transformedContent + 
                       modifiedContent.substring(ns.end);
    }
    
    // 写入修改后的内容
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
    console.log(`  ✓ Updated ${filePath}`);
    return true;
    
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

async function processDirectory(dirPath: string): Promise<{ processed: number; total: number }> {
  console.log(`\nScanning directory: ${dirPath}`);
  
  let processed = 0;
  let total = 0;
  
  async function scanDirectory(currentPath: string) {
    const files = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(currentPath, file.name);
      
      if (file.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
        total++;
        const wasProcessed = await processFile(fullPath);
        if (wasProcessed) {
          processed++;
        }
      }
    }
  }
  
  await scanDirectory(dirPath);
  return { processed, total };
}

async function main() {
  const targetDir = process.argv[2] || 'src';
  const absolutePath = path.resolve(targetDir);
  
  console.log('🚀 Starting namespace removal process...');
  console.log(`📁 Target directory: ${absolutePath}`);
  
  // 检查目录是否存在
  try {
    await fs.access(absolutePath);
  } catch {
    console.error(`❌ Directory does not exist: ${absolutePath}`);
    process.exit(1);
  }
  
  // 备份警告
  console.log('\n⚠️  WARNING: This script will modify TypeScript files.');
  console.log('   Make sure you have a backup of your code!');
  console.log('   Press Ctrl+C to cancel within 3 seconds...');
  
  // 等待 3 秒让用户取消
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    const result = await processDirectory(absolutePath);
    
    console.log('\n📊 Summary:');
    console.log(`   Total files scanned: ${result.total}`);
    console.log(`   Files with namespaces: ${result.processed}`);
    
    if (result.processed > 0) {
      console.log('\n✅ Namespace removal completed!');
      console.log('\n🔧 Next steps:');
      console.log('1. Run TypeScript compiler: tsc --noEmit');
      console.log('2. Fix any import statements that referenced namespaces');
      console.log('3. Run tests to ensure everything works');
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