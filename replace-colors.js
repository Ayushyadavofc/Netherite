const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace text-amber-500, bg-purple-400, border-orange-600, etc. with *-primary
  content = content.replace(/(text|bg|border|ring|fill|stroke|from|to|via)-(amber|orange|purple|blue|indigo|violet|rose|red)-[0-9]{2,3}(\/[0-9]+)?/g, (match, p1, p2, p3) => {
    return `${p1}-primary${p3 || ''}`;
  });

  // Replace shadow rgba
  content = content.replace(/rgba\(251,146,60,[^)]+\)/g, 'rgba(139,26,26,0.4)');
  content = content.replace(/rgba\(168,85,247,[^)]+\)/g, 'rgba(139,26,26,0.4)');
  content = content.replace(/rgba\(139,92,246,[^)]+\)/g, 'rgba(139,26,26,0.4)');

  content = content.replace(/#f59e0b/gi, '#8B1A1A');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

walkDir('src/renderer/src', processFile);
