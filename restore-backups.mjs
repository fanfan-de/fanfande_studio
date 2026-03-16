#!/usr/bin/env bun
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const srcDir = path.join(process.cwd(), 'packages', 'fanfandeagent', 'src');
  console.log(`📁 恢复备份文件在: ${srcDir}`);
  
  let restored = 0;
  async function processDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await processDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts.bak')) {
        const original = fullPath.slice(0, -4); // 移除 .bak
        await fs.copyFile(fullPath, original);
        console.log(`  ✅ 恢复: ${path.relative(srcDir, original)}`);
        restored++;
      }
    }
  }
  
  await processDir(srcDir);
  console.log(`\n🎉 恢复了 ${restored} 个文件。`);
}

if (import.meta.main) {
  main().catch(console.error);
}