#!/usr/bin/env node

/**
 * Import Checker Script
 * Helps maintain clean imports across the Testify codebase
 */

const fs = require('fs');
const path = require('path');

// Define import order rules
const IMPORT_ORDER = {
  react: 1,
  'react-dom': 1,
  'react-router-dom': 2,
  firebase: 3,
  jspdf: 4,
  xlsx: 4,
  // Add more third-party libraries here
};

function analyzeImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const imports = [];
  let inImportSection = true;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('import ') && inImportSection) {
      imports.push({
        line: line,
        lineNumber: i + 1,
        isReact: line.includes('react'),
        isThirdParty: Object.keys(IMPORT_ORDER).some(lib => line.includes(lib)),
        isRelative: line.includes('./') || line.includes('../'),
        isCSS: line.includes('.css')
      });
    } else if (line && !line.startsWith('//') && !line.startsWith('/*') && inImportSection) {
      inImportSection = false;
    }
  }
  
  return imports;
}

function checkImportOrder(imports) {
  const issues = [];
  let lastType = 0;
  
  imports.forEach((imp, index) => {
    let currentType = 0;
    
    if (imp.isReact) currentType = 1;
    else if (imp.isThirdParty) currentType = 2;
    else if (imp.isRelative && !imp.isCSS) currentType = 3;
    else if (imp.isCSS) currentType = 4;
    
    if (currentType < lastType) {
      issues.push({
        line: imp.lineNumber,
        message: `Import order issue: ${imp.line}`,
        suggestion: 'Consider reordering imports: React → Third-party → Relative → CSS'
      });
    }
    
    lastType = currentType;
  });
  
  return issues;
}

function scanDirectory(dir) {
  const results = [];
  
  function scanRecursive(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scanRecursive(fullPath);
      } else if (item.endsWith('.js') && !item.includes('.test.') && !item.includes('.spec.')) {
        const imports = analyzeImports(fullPath);
        const issues = checkImportOrder(imports);
        
        if (issues.length > 0) {
          results.push({
            file: path.relative(process.cwd(), fullPath),
            issues: issues
          });
        }
      }
    });
  }
  
  scanRecursive(dir);
  return results;
}

// Main execution
console.log('🔍 Checking import organization in Testify codebase...\n');

const srcDir = path.join(process.cwd(), 'src');
const results = scanDirectory(srcDir);

if (results.length === 0) {
  console.log('✅ All imports are properly organized!');
} else {
  console.log(`❌ Found ${results.length} files with import issues:\n`);
  
  results.forEach(result => {
    console.log(`📄 ${result.file}:`);
    result.issues.forEach(issue => {
      console.log(`  Line ${issue.line}: ${issue.message}`);
      console.log(`  💡 ${issue.suggestion}\n`);
    });
  });
}

console.log('\n📚 Import Order Guidelines:');
console.log('1. React and React hooks');
console.log('2. Third-party libraries (react-router-dom, firebase, etc.)');
console.log('3. Internal utilities and services');
console.log('4. Relative imports (components, context)');
console.log('5. CSS imports (always last)');
