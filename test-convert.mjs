#!/usr/bin/env bun
import * as ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'packages', 'fanfandeagent', 'src', 'id', 'id.ts');
const content = await fs.readFile(filePath, 'utf-8');
console.log('原始内容:');
console.log(content.substring(0, 200));

const sourceFile = ts.createSourceFile(
  filePath,
  content,
  ts.ScriptTarget.Latest,
  true
);

// 查找 export namespace
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
  console.log('未找到 namespace');
  process.exit(0);
}

console.log(`Namespace 名称: ${namespaceNode.name.text}`);
console.log(`开始: ${namespaceNode.getStart(sourceFile)} 结束: ${namespaceNode.getEnd()}`);

// 获取 body
if (!ts.isModuleBlock(namespaceNode.body)) {
  console.error('不是 ModuleBlock');
  process.exit(1);
}

const body = namespaceNode.body;
const bodyStart = body.getStart(sourceFile);
const bodyEnd = body.getEnd();
console.log(`Body 开始: ${bodyStart} 结束: ${bodyEnd}`);

// 提取 body 内部文本
const bodyText = content.substring(bodyStart + 1, bodyEnd - 1);
console.log('\nBody 文本:');
console.log(bodyText.substring(0, 200));

// 计算缩进
const beforeNamespace = content.substring(0, namespaceNode.getStart(sourceFile));
const linesBefore = beforeNamespace.split('\n');
const lastLine = linesBefore[linesBefore.length - 1];
const namespaceIndent = lastLine.match(/^(\s*)/)[0];
console.log(`Namespace 缩进: "${namespaceIndent}"`);

const bodyFirstLine = bodyText.split('\n')[0] || '';
const bodyIndentMatch = bodyFirstLine.match(/^(\s*)/);
const bodyIndent = bodyIndentMatch ? bodyIndentMatch[0] : '';
console.log(`Body 缩进: "${bodyIndent}"`);

// 移除缩进
const bodyLines = bodyText.split('\n');
const dedentedLines = bodyLines.map(line => {
  if (line.startsWith(bodyIndent)) {
    return line.substring(bodyIndent.length);
  }
  return line;
});
const newBodyText = dedentedLines.join('\n');
console.log('\n去除缩进后的 Body:');
console.log(newBodyText.substring(0, 200));