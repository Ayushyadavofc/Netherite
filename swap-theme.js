const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src/renderer/src');
const configTs = path.join(__dirname, 'tailwind.config.ts');
const configJs = path.join(__dirname, 'tailwind.config.js');
const indexHtml = path.join(__dirname, 'src/renderer/index.html');

const replacements = [
  { match: /#7C3AED/gi, replace: '#FF4500' },
  { match: /#6B21A8/gi, replace: '#E63E00' },
  { match: /#A78BFA/gi, replace: '#ff7043' },
  { match: /#333333/g, replace: '#444444' }, // Only exact for 333
  { match: /124,\s*58,\s*237/g, replace: '255,69,0' },
  { match: /#C4B5FD/gi, replace: '#ff7043' }
];

function replaceInFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  replacements.forEach(r => {
    content = content.replace(r.match, r.replace);
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', filePath);
  }
}

function processDirectory(dir) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.match(/\.(tsx|ts|css|html)$/)) {
      replaceInFile(fullPath);
    }
  }
}

processDirectory(srcDir);
replaceInFile(configTs);
replaceInFile(configJs);
replaceInFile(indexHtml);

console.log('Theme swap script executed successfully.');
