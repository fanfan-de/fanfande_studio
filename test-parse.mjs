#!/usr/bin/env bun
import * as ts from 'typescript';
import fs from 'fs/promises';

const filePath = process.argv[2];
const content = await fs.readFile(filePath, 'utf-8');
const sourceFile = ts.createSourceFile(
  filePath,
  content,
  ts.ScriptTarget.Latest,
  true
);

let found = false;
function visit(node) {
  if (ts.isModuleDeclaration(node) && 
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) &&
      ts.isIdentifier(node.name)) {
    console.log(`Found export namespace: ${node.name.text}`);
    console.log(`Start: ${node.getStart(sourceFile)}, End: ${node.getEnd()}`);
    found = true;
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
if (!found) {
  console.log('No export namespace found');
}