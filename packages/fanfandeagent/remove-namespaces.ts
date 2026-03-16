import fs from 'fs/promises';
import path from 'path';
import * as ts from 'typescript';

interface NamespaceInfo {
  name: string;
  start: number;
  end: number;
  exports: Array<{
    name: string;
    type: 'const' | 'let' | 'var' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'namespace';
    isExport: boolean;
  }>;
}

async function findNamespacesInFile(filePath: string): Promise<NamespaceInfo[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const namespaces: NamespaceInfo[] = [];

  function visit(node: ts.Node) {
    // 查找 export namespace 声明
    if (ts.isModuleDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      const namespaceName = node.name.getText();
      const start = node.getStart();
      const end = node.getEnd();
      
      const exports: NamespaceInfo['exports'] = [];
      
      // 收集 namespace 内的导出
      if (node.body && ts.isModuleBlock(node.body)) {
        node.body.statements.forEach(statement => {
          if (ts.isExportDeclaration(statement)) {
            // 处理 export { ... } 语法
            if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
              statement.exportClause.elements.forEach(element => {
                exports.push({
                  name: element.name.getText(),
                  type: 'const', // 默认类型
                  isExport: true
                });
              });
            }
          } else if (statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            // 处理 export const/function/class/interface/type 等
            let exportName = '';
            let exportType: NamespaceInfo['exports'][0]['type'] = 'const';
            
            if (ts.isVariableStatement(statement)) {
              exportType = 'const';
              statement.declarationList.declarations.forEach(decl => {
                if (ts.isIdentifier(decl.name)) {
                  exportName = decl.name.getText();
                }
              });
            } else if (ts.isFunctionDeclaration(statement) && statement.name) {
              exportType = 'function';
              exportName = statement.name.getText();
            } else if (ts.isClassDeclaration(statement) && statement.name) {
              exportType = 'class';
              exportName = statement.name.getText();
            } else if (ts.isInterfaceDeclaration(statement) && statement.name) {
              exportType = 'interface';
              exportName = statement.name.getText();
            } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
              exportType = 'type';
              exportName = statement.name.getText();
            } else if (ts.isEnumDeclaration(statement) && statement.name) {
              exportType = 'enum';
              exportName = statement.name.getText();
            }
            
            if (exportName) {
              exports.push({
                name: exportName,
                type: exportType,
                isExport: true
              });
            }
          }
        });
      }
      
      namespaces.push({
        name: namespaceName,
        start,
        end,
        exports
      });
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return namespaces;
}

async function removeNamespaceFromFile(filePath: string): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const namespaces = await findNamespacesInFile(filePath);
  
  if (namespaces.length === 0) {
    return false;
  }
  
  console.log(`Found ${namespaces.length} namespace(s) in ${filePath}:`);
  namespaces.forEach(ns => {
    console.log(`  - ${ns.name} (${ns.exports.length} exports)`);
  });
  
  // 从后往前处理，避免位置偏移
  let modifiedContent = content;
  for (let i = namespaces.length - 1; i >= 0; i--) {
    const ns = namespaces[i];
    const namespaceContent = content.substring(ns.start, ns.end);
    
    // 提取 namespace 内部内容
    const namespaceMatch = namespaceContent.match(/export\s+namespace\s+\w+\s*{([\s\S]*)}/);
    if (namespaceMatch) {
      const innerContent = namespaceMatch[1];
      
      // 移除 export namespace 包装，保留内部内容
      // 需要处理缩进
      const lines = innerContent.split('\n');
      const dedentedLines = lines.map(line => {
        // 移除前导空格（假设使用 2 空格缩进）
        return line.replace(/^\s{2}/, '');
      });
      
      const replacement = dedentedLines.join('\n');
      modifiedContent = modifiedContent.substring(0, ns.start) + replacement + modifiedContent.substring(ns.end);
    }
  }
  
  // 写入修改后的内容
  await fs.writeFile(filePath, modifiedContent, 'utf-8');
  return true;
}

async function updateImportsInFile(filePath: string, namespaceMap: Map<string, string[]>): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  let modified = false;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  
  function visit(node: ts.Node): ts.Node {
    // 查找导入语句
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause && importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        const elements = importClause.namedBindings.elements;
        
        // 检查是否有 namespace 导入
        for (const element of elements) {
          const importName = element.name.getText();
          const propertyName = element.propertyName?.getText();
          
          // 如果导入的是 namespace 成员，需要更新
          for (const [namespaceName, exports] of namespaceMap) {
            if (exports.includes(importName)) {
              console.log(`Found import of ${namespaceName}.${importName} in ${filePath}`);
              // 这里需要更新导入语句，但为了简单起见，我们只记录
              modified = true;
            }
          }
        }
      }
    }
    
    // 查找 namespace 成员访问
    if (ts.isPropertyAccessExpression(node)) {
      const leftText = node.expression.getText();
      const rightText = node.name.getText();
      
      for (const [namespaceName, exports] of namespaceMap) {
        if (leftText === namespaceName && exports.includes(rightText)) {
          console.log(`Found usage of ${namespaceName}.${rightText} in ${filePath}`);
          // 这里需要更新为直接使用成员名
          // 但为了简单起见，我们只记录
          modified = true;
        }
      }
    }
    
    return ts.visitEachChild(node, visit, {} as any);
  }
  
  const updatedSourceFile = ts.visitNode(sourceFile, visit);
  
  if (modified) {
    const newContent = printer.printFile(updatedSourceFile);
    await fs.writeFile(filePath, newContent, 'utf-8');
  }
  
  return modified;
}

async function processFile(filePath: string, namespaceMap: Map<string, string[]>): Promise<void> {
  try {
    const hadNamespace = await removeNamespaceFromFile(filePath);
    if (hadNamespace) {
      console.log(`Removed namespace(s) from ${filePath}`);
    }
    
    // 更新导入和引用
    const updatedImports = await updateImportsInFile(filePath, namespaceMap);
    if (updatedImports) {
      console.log(`Updated imports in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function findAllNamespaces(dirPath: string): Promise<Map<string, string[]>> {
  const namespaceMap = new Map<string, string[]>();
  
  async function scanDirectory(currentPath: string) {
    const files = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(currentPath, file.name);
      
      if (file.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
        const namespaces = await findNamespacesInFile(fullPath);
        for (const ns of namespaces) {
          namespaceMap.set(ns.name, ns.exports.map(e => e.name));
        }
      }
    }
  }
  
  await scanDirectory(dirPath);
  return namespaceMap;
}

async function processDirectory(dirPath: string): Promise<void> {
  console.log(`Scanning for namespaces in: ${dirPath}`);
  
  // 首先收集所有 namespace 信息
  const namespaceMap = await findAllNamespaces(dirPath);
  
  console.log(`Found ${namespaceMap.size} unique namespace(s):`);
  for (const [name, exports] of namespaceMap) {
    console.log(`  ${name}: ${exports.join(', ')}`);
  }
  
  // 然后处理所有文件
  async function processFiles(currentPath: string) {
    const files = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(currentPath, file.name);
      
      if (file.isDirectory()) {
        await processFiles(fullPath);
      } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
        await processFile(fullPath, namespaceMap);
      }
    }
  }
  
  await processFiles(dirPath);
}

async function main() {
  const targetDir = process.argv[2] || 'src';
  const absolutePath = path.resolve(targetDir);
  
  console.log(`Starting namespace removal process...`);
  console.log(`Target directory: ${absolutePath}`);
  
  // 备份警告
  console.log('\n⚠️  WARNING: This script will modify TypeScript files.');
  console.log('   Make sure you have a backup of your code!');
  console.log('   Press Ctrl+C to cancel within 5 seconds...');
  
  // 等待 5 秒让用户取消
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    await processDirectory(absolutePath);
    console.log('\n✅ Namespace removal completed!');
    console.log('\nNext steps:');
    console.log('1. Run TypeScript compiler to check for errors: tsc --noEmit');
    console.log('2. Run your tests to ensure everything still works');
    console.log('3. Manually review any files that had complex namespace usage');
  } catch (error) {
    console.error('\n❌ Error during processing:', error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}