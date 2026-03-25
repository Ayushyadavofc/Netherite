import { useState, useMemo } from 'react'
import { Check, Plus, Trash2, Edit2, X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Star } from 'lucide-react'
import { useTodos, Todo, updateScraps, scrapRewardForDifficulty } from '@/hooks/use-data'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'

type TabType = 'Today' | 'This Week' | 'This Month' | 'This Year' | 'All'

export default function TodosPage() {
  const [todos, setTodos] = useTodos()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState(1)
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])

  const [activeTab, setActiveTab] = useState<TabType>('Today')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const todayStr = new Date().toISOString().split('T')[0]

  const handleSave = () => {
    if (!title.trim()) return

    if (editingId) {
      setTodos(prev => prev.map(t => 
        t.id === editingId 
          ? { ...t, title, description, difficulty, dueDate } 
          : t
      ))
    } else {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        title,
        description,
        difficulty,
        dueDate,
        completed: false,
        createdAt: Date.now()
      }
      setTodos(prev => [...prev, newTodo])
    }
    resetForm()
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDifficulty(1)
    setDueDate(todayStr)
    setIsAdding(false)
    setEditingId(null)
  }

  const startEdit = (todo: Todo) => {
    setTitle(todo.title)
    setDescription(todo.description || '')
    setDifficulty(todo.difficulty)
    setDueDate(todo.dueDate)
    setEditingId(todo.id)
    setIsAdding(true)
  }

  const deleteTodo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const toggleTodo = (id: string, diff: number) => {
    setTodos(prev => prev.map(t => {
      if (t.id === id) {
        if (t.completed) {
          updateScraps(-scrapRewardForDifficulty(diff))
          return { ...t, completed: false, completedAt: undefined }
        } else {
          updateScraps(scrapRewardForDifficulty(diff))
          return { ...t, completed: true, completedAt: Date.now() }
        }
      }
      return t
    }))
  }

  const isDateInTab = (dateStr: string, tab: TabType) => {
    if (tab === 'All') return true
    
    const date = new Date(dateStr)
    const today = new Date(todayStr)
    
    if (tab === 'Today') return dateStr === todayStr
    
    if (tab === 'This Week') {
      const firstDay = new Date(today.setDate(today.getDate() - today.getDay()))
      const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6))
      return date >= firstDay && date <= lastDay
    }
    if (tab === 'This Month') {
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()
    }
    if (tab === 'This Year') {
      return date.getFullYear() === today.getFullYear()
    }
    return false
  }

  const filteredTodos = useMemo(() => {
    let filtered = todos
    
    if (selectedDate) {
      filtered = todos.filter(t => t.dueDate === selectedDate)
    } else {
      filtered = todos.filter(t => isDateInTab(t.dueDate, activeTab))
    }

    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [todos, activeTab, selectedDate, todayStr])

  const renderStars = (count: number = 0, interactive = false, onClick?: (n: number) => void) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <button 
            key={i}
            type="button"
            className={`${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
            onClick={(e) => {
              if (interactive && onClick) {
                e.preventDefault()
                onClick(i + 1)
              }
            }}
          >
            <Star className={`w-3 h-3 ${i < count ? 'text-[#ff7043] fill-[#ff7043]' : 'text-[#444444]'}`} />
          </button>
        ))}
      </div>
    )
  }

  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  return (
    <div className="flex w-full min-h-screen bg-[#0a0808]">
        
        {/* Left Panel - Calendar */}
        <aside className="hidden lg:flex flex-col w-80 shrink-0 z-10 sticky top-16 h-[calc(100vh-64px)] border-r border-[#2a2422] bg-[#0a0808] items-center pt-8 px-6">
          <div className="w-full flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold text-white tracking-widest uppercase font-headline">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1 flex items-center justify-center bg-transparent border border-[#2a2422] text-[#666666] hover:border-[#ff5625] hover:text-white rounded-[4px] transition-colors"><ChevronLeft className="w-4 h-4"/></button>
              <button onClick={nextMonth} className="p-1 flex items-center justify-center bg-transparent border border-[#2a2422] text-[#666666] hover:border-[#ff5625] hover:text-white rounded-[4px] transition-colors"><ChevronRight className="w-4 h-4"/></button>
            </div>
          </div>

          <div className="grid grid-cols-7 w-full text-center text-[0.6rem] uppercase tracking-widest font-bold text-white mb-4">
            <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
          </div>

          <div className="grid grid-cols-7 gap-y-2 gap-x-1 w-full">
            {[...Array(startingDayOfWeek)].map((_, i) => (
              <div key={`empty-${i}`} className="h-8 border border-transparent" />
            ))}
            
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
              const dateStr = [
                dateObj.getFullYear(),
                String(dateObj.getMonth() + 1).padStart(2, '0'),
                String(dateObj.getDate()).padStart(2, '0')
              ].join('-')

              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const dayTodos = todos.filter(t => t.dueDate === dateStr)
              const hasTodo = dayTodos.filter(t => !t.completed).length > 0 || dayTodos.length > 0

              return (
                <div key={day} className="relative group flex items-center justify-center">
                  <button
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`
                      w-8 h-8 rounded flex flex-col items-center justify-center relative transition-colors text-sm
                      ${isSelected ? 'bg-[#ff5625] text-white font-bold' : ''}
                      ${!isSelected && isToday ? 'text-[#ffb77d] font-bold' : ''}
                      ${!isSelected && !isToday && hasTodo ? 'bg-[#ffb77d]/10 text-[#ffb77d] font-medium hover:bg-[#ffb77d]/20' : ''}
                      ${!isSelected && !isToday && !hasTodo ? 'border border-transparent text-[#a8a0a0] hover:bg-[#141212]' : ''}
                    `}
                  >
                    <span>{day}</span>
                    {hasTodo && !isSelected && (
                      <div className={`w-1 h-1 rounded-full absolute bottom-1 ${dayTodos.some(t => t.dueDate < todayStr && !t.completed) ? 'bg-[#ff5449]' : 'bg-[#ffb77d]'}`} />
                    )}
                  </button>
                  {/* Tooltip */}
                  {dayTodos.length > 0 && (
                    <div className="absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full hidden group-hover:flex flex-col gap-2 z-[100] w-48 p-4 bg-[#141212] border border-[#2a2422] shadow-[0_0_16px_rgba(255,86,37,0.2)] rounded-lg pointer-events-none">
                      <p className="text-[0.6rem] uppercase tracking-widest font-bold border-b border-[#2a2422] pb-2 text-[#a8a0a0]">
                        {new Date(dateStr).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                      </p>
                      {dayTodos.map(t => (
                        <div key={t.id} className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-[2px] flex items-center justify-center shrink-0 border ${t.completed ? 'bg-[#ff5625] border-[#ff5625]' : 'border-[#2a2422] bg-black'}`}>
                            {t.completed && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </div>
                          <span className={`text-xs truncate ${t.completed ? 'text-[#a8a0a0] line-through' : 'text-white'}`}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {selectedDate && (
            <div className="mt-8 pt-6 border-t border-[#2a2422] w-full">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[0.6rem] uppercase tracking-widest font-bold text-[#a8a0a0] flex items-center gap-2">
                  <CalendarIcon className="w-3 h-3" /> Filters
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-[0.6rem] uppercase font-bold text-[#a8a0a0] hover:text-white">Clear</button>
              </div>
              <p className="text-sm font-bold text-[#ffb77d] uppercase tracking-widest">{new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
          )}
        </aside>

        {/* Right Panel - Todo List */}
        <main className="flex-1 flex flex-col p-8 md:p-16 max-w-7xl mx-auto w-full h-full relative">
          <div className="w-full mx-auto max-w-3xl flex flex-col h-full">
          {/* Header */}
          <header className="pt-8 pb-4 flex flex-col gap-6 w-full border-b border-[#2a2422] mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[#444444] mb-1">Your Itinerary</p>
                <h1 className="text-4xl font-extrabold text-[#ffb77d] font-headline">
                  To-Do
                </h1>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-[rgba(255,86,37,0.1)] text-[#ff5625] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[rgba(255,86,37,0.2)] transition-all uppercase tracking-widest"
              >
                <Plus className="w-4 h-4" />
                New Task
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 w-full mt-2">
              {(['Today', 'This Week', 'This Month', 'This Year', 'All'] as TabType[]).map(tab => (
                <button
                  key={tab}
                  className={`py-3 font-semibold text-sm transition-colors uppercase tracking-wider relative ${
                    activeTab === tab && !selectedDate
                      ? 'text-[#ff7043]'
                      : 'text-[#666666] hover:text-white'
                  }`}
                  onClick={() => { setActiveTab(tab); setSelectedDate(null); }}
                >
                  {tab}
                  {activeTab === tab && !selectedDate && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF4500]" />
                  )}
                </button>
              ))}
            </div>
          </header>

          {/* List Area */}
          <div className="p-8 flex-1 overflow-y-auto w-full">
            
            {/* Add/Edit Form */}
            {isAdding && (
              <div className="mb-8 p-6 bg-[#111111] border border-[#1f1d1d] rounded-[8px] relative">
                <button 
                  onClick={resetForm}
                  className="absolute top-4 right-4 text-[#666666] hover:text-white transition-colors bg-transparent border-none"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest">{editingId ? 'Edit Task' : 'Create New Task'}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-widest font-bold text-[#444444] mb-2">Title</label>
                    <input 
                      type="text" 
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full bg-[#0a0808] border border-[#1f1d1d] rounded px-4 py-3 text-white placeholder:text-[#444444] focus:outline-none focus:border-[#FF4500] transition-all text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-widest font-bold text-[#444444] mb-2">Description (Optional)</label>
                    <input 
                      type="text" 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add details..."
                      className="w-full bg-[#0a0808] border border-[#1f1d1d] rounded px-4 py-3 text-white placeholder:text-[#444444] focus:outline-none focus:border-[#FF4500] transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[#444444] mb-2">Due Date</label>
                    <input 
                      type="date" 
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-[#0a0808] border border-[#1f1d1d] text-[#ff7043] rounded px-4 py-3 focus:outline-none focus:border-[#FF4500] transition-all text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[#444444] mb-3">Difficulty & Reward</label>
                    <div className="flex items-center gap-4 bg-[#0a0808] p-4 rounded border border-[#1f1d1d] w-fit">
                      {renderStars(difficulty, true, setDifficulty)}
                      <div className="w-px h-6 bg-[#1f1d1d]" />
                      <span className="text-[0.6rem] font-bold text-[#444444] uppercase tracking-widest">
                        +{scrapRewardForDifficulty(difficulty)} SCRAPS
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end gap-4 border-t border-[#1f1d1d]">
                  <button 
                    onClick={resetForm}
                    className="bg-transparent border border-[#1f1d1d] text-[#666666] hover:border-[#E63E00] hover:text-white px-6 py-2 rounded-[4px] font-medium text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={!title.trim()}
                    className="bg-[rgba(255,86,37,0.1)] text-[#ff5625] hover:bg-[rgba(255,86,37,0.2)] disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-bold transition-all uppercase tracking-widest"
                  >
                    {editingId ? 'Save Changes' : 'Create Task'}
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="space-y-4 pb-20">
              {filteredTodos.length > 0 ? (
                filteredTodos.map(todo => {
                  const isLate = !todo.completed && todo.dueDate < todayStr
                  return (
                    <div 
                      key={todo.id} 
                      className={`group flex items-center justify-between p-6 bg-[#111111] border rounded-[8px] transition-all cursor-pointer hover:border-[#E63E00] hover:shadow-[0_0_20px_rgba(255,69,0,0.15)] ${
                        todo.completed 
                          ? 'border-[#1f1d1d] opacity-40' 
                          : isLate 
                            ? 'bg-[#111111] border-[#FF4500] shadow-[0_0_12px_rgba(255,69,0,0.15)]'
                            : 'border-[#1f1d1d]'
                      }`}
                      onClick={() => toggleTodo(todo.id, todo.difficulty)}
                    >
                      <div className="flex items-center gap-6 w-full min-w-0">
                        {/* Custom Checkbox */}
                        <div className={`w-6 h-6 shrink-0 rounded-[2px] flex items-center justify-center transition-colors ${
                          todo.completed 
                            ? 'bg-[#FF4500] border-[#FF4500]' 
                            : isLate
                              ? 'border border-[#FF4500] bg-[rgba(255,69,0,0.1)] group-hover:bg-[#FF4500]'
                              : 'border border-[#1f1d1d] group-hover:border-[#FF4500]'
                        }`}>
                          {todo.completed && <Check className="w-4 h-4 text-white font-bold" strokeWidth={3} />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold text-sm transition-colors ${todo.completed ? 'text-white line-through' : 'text-white'}`}>
                            {todo.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs">
                            <span className={`flex items-center gap-1 uppercase tracking-widest text-[0.6rem] font-bold ${todo.completed ? 'text-[#666666]' : isLate ? 'text-[#ff7043]' : 'text-[#666666]'}`}>
                              <Clock className="w-3 h-3" />
                              {todo.dueDate === todayStr ? 'Today' : new Date(todo.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              {isLate && ' (Overdue)'}
                            </span>
                            {todo.description && (
                              <span className={`truncate max-w-[200px] ${todo.completed ? 'text-[#666666]' : 'text-[#666666]'}`}>
                                • {todo.description}
                              </span>
                            )}
                          </div>
                          
                          <div className="mt-3">
                              {renderStars(todo.difficulty)}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Reward & Actions */}
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="flex flex-col items-end justify-center h-full">
                          <span className="text-[0.6rem] font-bold text-[#ffb77d] uppercase flex items-center gap-1">+{scrapRewardForDifficulty(todo.difficulty)} <NetheriteScrapIcon size={10} /></span>
                        </div>
                        
                        {/* Hover Actions */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); startEdit(todo); }}
                            className="w-8 h-8 flex items-center justify-center bg-transparent border border-[#1f1d1d] text-[#666666] hover:border-[#E63E00] hover:text-white rounded-[4px] transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => deleteTodo(todo.id, e)}
                            className="w-8 h-8 flex items-center justify-center bg-transparent border border-[#1f1d1d] text-[#666666] hover:border-[#7f1d1d] hover:text-[#f87171] hover:bg-[rgba(127,29,29,0.15)] rounded-[4px] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-20 border border-dashed border-[#1f1d1d] bg-[#111111] rounded-[8px]">
                  <Check className="w-12 h-12 text-[#444444] mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">
                    {selectedDate ? 'No tasks on this date' : 'All clear!'}
                  </h3>
                  <p className="text-[#666666] text-sm mb-6 max-w-sm mx-auto">
                    Take a break or create a new task to earn more scraps.
                  </p>
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="bg-[rgba(255,86,37,0.1)] text-[#ff5625] hover:bg-[rgba(255,86,37,0.2)] px-6 py-2 rounded-lg text-sm font-bold transition-all uppercase tracking-widest"
                  >
                    Create a Task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}
