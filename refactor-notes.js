const fs = require('fs');
const path = require('path');

// 1. FlashcardsPage.tsx
const fcPath = path.join(__dirname, 'src/renderer/src/pages/FlashcardsPage.tsx');
let fc = fs.readFileSync(fcPath, 'utf8');

// remove Header entirely
fc = fc.replace(/<header[\s\S]*?<\/header>/, '');
// replace wrapper
fc = fc.replace(/<div className="min-h-screen bg-zinc-950">/, '<div className="flex flex-col h-full w-full">');
// Note: ends with </div> which matches the new <div>

fs.writeFileSync(fcPath, fc);
console.log('FlashcardsPage.tsx updated');

// 2. workspace.tsx
const wsPath = path.join(__dirname, 'src/renderer/src/components/notes/workspace.tsx');
let ws = fs.readFileSync(wsPath, 'utf8');

// replace wrapper
ws = ws.replace(/<div className="flex h-screen bg-zinc-950 text-zinc-100">/, '<div className="flex h-full w-full">');

// Remove Quick Links section
ws = ws.replace(/{\/\* Quick Links \*\/}[\s\S]*?{\/\* File Tree \*\/}/, '{/* File Tree */}');

fs.writeFileSync(wsPath, ws);
console.log('workspace.tsx updated');
