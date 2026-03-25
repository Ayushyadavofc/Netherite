const fs = require('fs');
const path = require('path');

const rpPath = path.join(__dirname, 'src/renderer/src/components/dashboard/right-panel.tsx');
let content = fs.readFileSync(rpPath, 'utf8');

// Replace RightPanel wrapper
content = content.replace(/<aside [^>]*bg-zinc-900 border-l border-zinc-800[^>]*>/, 
  '<aside className="w-80 bg-black border-l border-[#1e1e1e] flex flex-col overflow-y-auto">');

content = content.replace(/border-b border-zinc-800/g, 'border-b border-[#1e1e1e]');

// Convert "mini boxes" to "progress bars" for STR, INT, END
const oldStats = /<div className="w-full flex justify-between gap-2 z-10">[\s\S]*?<\/div>\s*<\/div>/;
const newStats = `<div className="w-full flex flex-col gap-3 z-10 px-2 mt-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs px-1">
              <div className="flex items-center gap-1 text-[#A78BFA]"><Sword className="w-3 h-3"/>STR</div>
              <span className="text-[#E8E8E8]">{stats.str}</span>
            </div>
            <div className="h-1.5 w-full bg-[#1e1e1e] rounded-full overflow-hidden">
              <div className="h-full bg-[#7C3AED]" style={{ width: \`\${Math.min((stats.str / 100) * 100, 100)}%\` }} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs px-1">
              <div className="flex items-center gap-1 text-[#A78BFA]"><Brain className="w-3 h-3"/>INT</div>
              <span className="text-[#E8E8E8]">{stats.int}</span>
            </div>
            <div className="h-1.5 w-full bg-[#1e1e1e] rounded-full overflow-hidden">
              <div className="h-full bg-[#7C3AED]" style={{ width: \`\${Math.min((stats.int / 100) * 100, 100)}%\` }} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs px-1">
              <div className="flex items-center gap-1 text-[#A78BFA]"><Heart className="w-3 h-3"/>END</div>
              <span className="text-[#E8E8E8]">{stats.end}</span>
            </div>
            <div className="h-1.5 w-full bg-[#1e1e1e] rounded-full overflow-hidden">
              <div className="h-full bg-[#7C3AED]" style={{ width: \`\${Math.min((stats.end / 100) * 100, 100)}%\` }} />
            </div>
          </div>
        </div>
      </div>`;

content = content.replace(oldStats, newStats);

// Update XP bar
const oldXpBar = /<div className="h-3 bg-zinc-800 rounded-full overflow-hidden">[\s\S]*?<\/div>\s*<\/div>/;
const newXpBar = `<div className="h-2 bg-[#1e1e1e] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          {xpPercent > 0 ? (
            <div
              className="h-full bg-[#7C3AED] rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(124,58,237,0.5)]"
              style={{ width: \`\${xpPercent}%\` }}
            />
          ) : (
            <div className="h-full w-0 rounded-full" />
          )}
        </div>`;
content = content.replace(oldXpBar, newXpBar);

// Update level number background
content = content.replace(/bg-gradient-to-br from-primary to-primary/, 'bg-[#1e1e1e] border border-[#6B21A8]');
content = content.replace(/text-zinc-950/, 'text-[#A78BFA]');

// Save
fs.writeFileSync(rpPath, content);
console.log('Right panel updated');
