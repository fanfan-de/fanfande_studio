#!/usr/bin/env bun
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'packages', 'fanfandeagent', 'src');

async function checkFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  let hasNamespace = false;
  let namespaceLine = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export namespace')) {
      hasNamespace = true;
      namespaceLine = i + 1;
      break;
    }
  }
  
  return { hasNamespace, namespaceLine };
}

async function walkDir(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function main() {
  console.log('🔍 Checking for TypeScript namespaces in fanfandeagent/src...');
  const files = await walkDir(srcDir);
  console.log(`📁 Found ${files.length} TypeScript files`);
  
  const namespaceFiles = [];
  for (const file of files) {
    const result = await checkFile(file);
    if (result.hasNamespace) {
      namespaceFiles.push({
        file: path.relative(srcDir, file),
        line: result.namespaceLine
      });
    }
  }
  
  console.log(`\n📦 Found ${namespaceFiles.length} files with 'export namespace':`);
  for (const { file, line } of namespaceFiles) {
    console.log(`  - ${file} (line ${line})`);
  }
}

main().catch(console.error);