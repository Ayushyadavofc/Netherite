const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  
  let original = fs.readFileSync(filePath, 'utf8');
  let content = original;

  // Backgrounds to black
  content = content.replace(/bg-zinc-950/g, 'bg-black');
  content = content.replace(/bg-zinc-900\/50/g, 'bg-black');
  content = content.replace(/bg-zinc-900/g, 'bg-black');
  content = content.replace(/bg-zinc-800\/80/g, 'bg-[#0f0f0f]');
  content = content.replace(/bg-zinc-800\/50/g, 'bg-[#0f0f0f]');
  content = content.replace(/bg-zinc-800\/30/g, 'bg-black');
  content = content.replace(/bg-zinc-800\/20/g, 'bg-black');
  content = content.replace(/bg-zinc-800/g, 'bg-[#0f0f0f]');
  
  // Borders to #1e1e1e
  content = content.replace(/border-zinc-900\/50/g, 'border-[#1e1e1e]');
  content = content.replace(/border-zinc-900/g, 'border-[#1e1e1e]');
  content = content.replace(/border-zinc-800\/50/g, 'border-[#1e1e1e]');
  content = content.replace(/border-zinc-800/g, 'border-[#1e1e1e]');
  content = content.replace(/border-zinc-700\/50/g, 'border-[#1e1e1e]');
  content = content.replace(/border-zinc-700/g, 'border-[#1e1e1e]');
  
  // Next Unlocks Glow to Purple
  content = content.replace(/shadow-\[0_0_15px_rgba\(250,204,21,0\.15\)\]/g, 'shadow-[0_0_15px_rgba(124,58,237,0.15)]');
  content = content.replace(/shadow-\[0_0_20px_rgba\(59,130,246,0\.3\)\]/g, 'shadow-[0_0_20px_rgba(124,58,237,0.3)]');
  content = content.replace(/shadow-\[0_0_25px_rgba\(168,85,247,0\.5\)\]/g, 'shadow-[0_0_25px_rgba(124,58,237,0.5)]');

  // Next Unlocks borders to exact purple rules
  content = content.replace(/border-yellow-500\/30/g, 'border-[#1e1e1e]');
  content = content.replace(/border-blue-500\/50/g, 'border-[#6B21A8]');
  content = content.replace(/border-purple-500\/50/g, 'border-[#7C3AED]');
  
  // Change rounded-xl to rounded-[6px] on cards
  content = content.replace(/rounded-xl/g, 'rounded-[6px]');
  content = content.replace(/rounded-2xl/g, 'rounded-[6px]');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Updated', filePath);
  }
}

walkDir(path.join(__dirname, 'src/renderer/src'), processFile);
