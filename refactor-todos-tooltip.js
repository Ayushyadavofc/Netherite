const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/renderer/src/pages/TodosPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The replacement content
const newMapping = `              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const dayTodos = todos.filter(t => t.dueDate === dateStr)
              const hasTodo = dayTodos.filter(t => !t.completed).length > 0 || dayTodos.length > 0

              return (
                <div key={day} className="relative group flex items-center justify-center">
                  <button
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={\`
                      w-full h-10 rounded-lg flex flex-col items-center justify-center relative transition-colors border
                      \${isSelected ? 'bg-primary/20 text-primary border-primary/50 font-bold' : ''}
                      \${!isSelected && isToday ? 'border-primary/50 text-primary font-bold' : ''}
                      \${!isSelected && !isToday ? 'border-transparent text-zinc-400 hover:bg-primary/5' : ''}
                    \`}
                  >
                    <span>{day}</span>
                    {hasTodo && (
                      <div className="w-1 h-1 bg-primary rounded-full absolute bottom-1.5" />
                    )}
                  </button>
                  {dayTodos.length > 0 && (
                    <div className="absolute left-1/2 -top-1 -translate-x-1/2 -translate-y-full hidden group-hover:flex flex-col gap-1.5 z-[100] w-48 p-3 bg-[#111111] border border-primary shadow-2xl rounded-lg pointer-events-none">
                      <p className="text-xs font-bold border-b border-zinc-800 pb-1.5 mb-0.5">{new Date(dateStr).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</p>
                      {dayTodos.map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <div className={\`w-3 h-3 rounded-sm flex items-center justify-center border shrink-0 \${t.completed ? 'bg-primary border-primary' : 'border-zinc-500'}\`}>
                            {t.completed && <CheckCircle2 className="w-2 h-2 text-black" />}
                          </div>
                          <span className={\`truncate \${t.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}\`}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )`;

// Find the target string pattern
const pattern = /const isToday = [^]+?return \([\s\S]+?<\/button>\s*\)/;

content = content.replace(pattern, newMapping);

fs.writeFileSync(filePath, content);
console.log('Todos tooltip updated');
