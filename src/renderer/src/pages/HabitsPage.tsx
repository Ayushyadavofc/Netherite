import { useState, useMemo } from 'react'
import { Flame, Check, Plus, Trash2, Edit2, X, Star, Target } from 'lucide-react'
import { useHabits, Habit, updateScraps, scrapRewardForDifficulty } from '@/hooks/use-data'
import { getLocalToday } from '@/lib/date'

export default function HabitsPage() {
  const [habits, setHabits] = useHabits()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState(1)

  const todayStr = getLocalToday()

  const handleSave = () => {
    if (!title.trim()) return

    if (editingId) {
      setHabits(prev => prev.map(h => 
        h.id === editingId 
          ? { ...h, title, description, difficulty } 
          : h
      ))
    } else {
      const newHabit: Habit = {
        id: crypto.randomUUID(),
        title,
        description,
        difficulty,
        completedDates: [],
        createdAt: Date.now()
      }
      setHabits(prev => [...prev, newHabit])
    }

    resetForm()
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDifficulty(1)
    setIsAdding(false)
    setEditingId(null)
  }

  const startEdit = (habit: Habit) => {
    setTitle(habit.title)
    setDescription(habit.description || '')
    setDifficulty(habit.difficulty)
    setEditingId(habit.id)
    setIsAdding(true)
  }

  const deleteHabit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  const toggleHabit = (id: string, diff: number) => {
    setHabits(prev => prev.map(h => {
      if (h.id === id) {
        const isCompleted = h.completedDates.includes(todayStr)
        if (isCompleted) {
          updateScraps(-scrapRewardForDifficulty(diff))
          return { ...h, completedDates: h.completedDates.filter(d => d !== todayStr) }
        } else {
          updateScraps(scrapRewardForDifficulty(diff))
          return { ...h, completedDates: [...h.completedDates, todayStr] }
        }
      }
      return h
    }))
  }

  const sortedHabits = useMemo(() => {
    return [...habits].sort((a, b) => {
      const aCompleted = a.completedDates.includes(todayStr)
      const bCompleted = b.completedDates.includes(todayStr)
      
      if (aCompleted && !bCompleted) return 1
      if (!aCompleted && bCompleted) return -1
      
      if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty
      return b.createdAt - a.createdAt
    })
  }, [habits, todayStr])

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
            <Star className={`w-3 h-3 ${i < count ? 'fill-[var(--nv-primary)] text-[var(--nv-primary)]' : 'text-[var(--nv-subtle)]'}`} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex w-full min-h-screen bg-[var(--nv-bg)]">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 z-10 p-6 sticky top-16 h-[calc(100vh-64px)] border-r border-[var(--nv-border)] bg-[var(--nv-bg)]">
        <div className="mb-8">
          <h2 className="text-xs font-bold text-[var(--nv-muted)] uppercase tracking-widest">Ignite</h2>
        </div>
        <nav className="flex flex-col gap-2">
          <button className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[var(--nv-primary)] bg-[var(--nv-primary-soft)] rounded-lg text-left transition-all">
            <Target className="h-5 w-5" />
            <span>All Habits</span>
          </button>
          <button className="flex items-center gap-3 px-4 py-3 border border-transparent text-sm font-medium text-[var(--nv-muted)] hover:text-[var(--nv-secondary)] hover:bg-[var(--nv-surface)] transition-all rounded-lg text-left">
            <Flame className="h-5 w-5" />
            <span>Mastery</span>
          </button>
        </nav>
        <div className="mt-auto">
          <button 
            onClick={() => setIsAdding(true)}
            className="w-full py-3 bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft-strong)] rounded-lg text-sm font-bold transition-all active:scale-95 uppercase tracking-widest"
          >
            New Habit
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-8 md:p-16 max-w-7xl mx-auto h-full">
        {/* Header */}
        <header className="flex items-start justify-between mb-8 w-full">
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[var(--nv-subtle)] mb-1">Resets at midnight</p>
            <h1 className="text-4xl font-extrabold text-[var(--nv-secondary)] font-headline">
              Habits
            </h1>
          </div>
        </header>

        {/* Content Box */}
        <div className="w-full">
          
          {/* Add/Edit Form */}
          {isAdding && (
            <div className="mb-8 p-6 bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-[8px] relative">
              <button 
                onClick={resetForm}
                className="absolute top-4 right-4 text-[var(--nv-subtle)] hover:text-white transition-colors bg-transparent border-none"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest">{editingId ? 'Edit Habit' : 'Create New Habit'}</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">Title</label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Read 10 pages"
                    className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white placeholder:text-[var(--nv-subtle)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">Description (Optional)</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Before bed"
                    className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white placeholder:text-[var(--nv-subtle)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-3">Difficulty & Reward</label>
                  <div className="flex items-center gap-4 bg-[var(--nv-bg)] p-4 rounded border border-[var(--nv-border)] w-fit">
                    {renderStars(difficulty, true, setDifficulty)}
                    <div className="w-px h-6 bg-[var(--nv-border)]" />
                    <span className="text-[0.6rem] font-bold text-[var(--nv-subtle)] uppercase tracking-widest">
                      +{scrapRewardForDifficulty(difficulty)} SCRAPS
                    </span>
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-4 border-t border-[var(--nv-border)]">
                  <button 
                    onClick={resetForm}
                    className="bg-transparent border border-[var(--nv-border)] text-[var(--nv-subtle)] hover:border-[var(--nv-primary)] hover:text-white px-6 py-2 rounded-[4px] font-medium text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={!title.trim()}
                    className="bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft-strong)] disabled:opacity-50 px-6 py-2 rounded-lg font-bold text-sm transition-all uppercase tracking-widest"
                  >
                    {editingId ? 'Save Changes' : 'Create Habit'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="space-y-4">
            {sortedHabits.length > 0 ? (
              sortedHabits.map(habit => {
                const isCompleted = habit.completedDates.includes(todayStr)
                return (
                  <div 
                    key={habit.id} 
                    className={`group flex items-center justify-between p-6 bg-[var(--nv-surface)] border rounded-[8px] transition-all cursor-pointer hover:border-[var(--nv-primary)] hover:shadow-[0_0_20px_var(--nv-primary-glow)] ${
                      isCompleted ? 'border-[var(--nv-border)] opacity-40' : 'border-[var(--nv-border)]'
                    }`}
                    onClick={() => toggleHabit(habit.id, habit.difficulty)}
                  >
                    <div className="flex items-center gap-6 w-full">
                      {/* Custom Checkbox */}
                      <div className={`w-6 h-6 shrink-0 flex items-center justify-center transition-colors rounded-[2px] ${
                        isCompleted 
                          ? 'border-[var(--nv-primary)] bg-[var(--nv-primary)]' 
                          : 'border border-[var(--nv-border)] group-hover:border-[var(--nv-primary)]'
                      }`}>
                        {isCompleted && <Check className="w-4 h-4 text-white font-bold" strokeWidth={3} />}
                      </div>

                      {/* Info Formatter */}
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm transition-colors decoration-2 ${isCompleted ? 'text-white line-through' : 'text-white'}`}>
                          {habit.title}
                        </h3>
                        {habit.description && (
                          <p className="text-xs text-[var(--nv-subtle)] mt-1 truncate">
                            {habit.description}
                          </p>
                        )}
                        <div className="mt-3">
                            {renderStars(habit.difficulty)}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Reward & Actions */}
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="flex flex-col items-end justify-center h-full">
                        <span className="text-[0.6rem] font-bold text-[var(--nv-secondary)] uppercase">+{scrapRewardForDifficulty(habit.difficulty)} 🔩</span>
                      </div>
                      
                      {/* Hover Actions */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); startEdit(habit); }}
                          className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--nv-border)] bg-transparent text-[var(--nv-subtle)] transition-colors hover:border-[var(--nv-primary)] hover:text-white"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => deleteHabit(habit.id, e)}
                          className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--nv-border)] bg-transparent text-[var(--nv-subtle)] transition-colors hover:border-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-20 border border-dashed border-[var(--nv-border)] bg-[var(--nv-surface)] rounded-[8px]">
                <Flame className="w-12 h-12 text-[var(--nv-danger)] mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">No habits yet</h3>
                <p className="text-[var(--nv-subtle)] text-sm mb-6 max-w-sm mx-auto">Create daily habits to earn scraps and unlock new items.</p>
                <button 
                  onClick={() => setIsAdding(true)}
                  className="bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft-strong)] px-6 py-2 rounded-lg font-bold text-sm transition-all uppercase tracking-widest"
                >
                  Create Your First Habit
                </button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
