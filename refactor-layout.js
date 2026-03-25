const fs = require('fs');
const path = require('path');

const pages = [
  'src/renderer/src/pages/DashboardPage.tsx',
  'src/renderer/src/pages/HabitsPage.tsx',
  'src/renderer/src/pages/TodosPage.tsx'
];

for (const p of pages) {
  const filePath = path.join(__dirname, p);
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip imports
  content = content.replace(/import \{ Sidebar \}[^\n]+\n/g, '');
  content = content.replace(/import \{ RightPanel \}[^\n]+\n/g, '');

  let original = content;

  // Find the exact return wrapper start
  content = content.replace(/return \(\s*<div[^>]*bg-zinc-950[^>]*>\s*<Sidebar \/>\s*(?:{[/]*[^\n]*\n)?\s*(<main)/, 'return (\n    $1');

  // Find the exact return wrapper end
  content = content.replace(/<\/main>\s*<RightPanel \/>\s*<\/div>/, '</main>');

  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Stripped layout from ' + p);
  } else {
    console.log('Failed to strip ' + p);
  }
}

// Update MainLayout.tsx
const mlPath = path.join(__dirname, 'src/renderer/src/components/layout/MainLayout.tsx');
let mlContent = fs.readFileSync(mlPath, 'utf8');
mlContent = mlContent.replace(/<main[^>]*>\s*<Outlet \/>\s*<\/main>/, '<Outlet />');
fs.writeFileSync(mlPath, mlContent);
console.log('Updated MainLayout.tsx');
