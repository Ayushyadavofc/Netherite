import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  SkipForward,
  Star,
  Trash2,
  X
} from 'lucide-react'

import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { MomentumLiquidBar } from '@/components/todos/MomentumLiquidBar'
import { useIsDesktopSidebar } from '@/hooks/use-desktop-breakpoint'
import {
  Todo,
  TodoDifficultyTag,
  updateScraps,
  scrapRewardForDifficulty,
  useTodoMomentum,
  useTodoMomentumContext,
  useTodos
} from '@/hooks/use-data'
import { getLocalToday, parseLocalDate } from '@/lib/date'
import { emitPreChaosAppEvent } from '@/prechaos/app-events'
import { preChaosBridge } from '@/prechaos/bridge'
import {
  applyIdleMomentumDecay,
  formatScheduledTime,
  getMomentumBarLabel,
  getTodoDifficultyTag,
  getTodoReorderResult,
  recordTodoOutcome,
  touchTodoMomentum
} from '@/todos/momentum'

type TabType = 'Today' | 'This Week' | 'This Month' | 'This Year' | 'All'
type ManualDifficultyOption = TodoDifficultyTag | 'auto'

const getLocalDateString = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const normalizeEstimatedMinutes = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const getSuggestionTone = (label: 'suggested now' | 'save for later' | 'scheduled' | null) => {
  if (label === 'suggested now') return 'text-[var(--nv-secondary)]'
  if (label === 'save for later') return 'text-[var(--nv-primary)]'
  return 'text-[var(--nv-subtle)]'
}

export default function TodosPage() {
  const [todos, setTodos] = useTodos()
  const [momentum, setMomentum] = useTodoMomentum()
  const [momentumContext, setMomentumContext] = useTodoMomentumContext()

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState(1)
  const [dueDate, setDueDate] = useState(getLocalToday())
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [manualDifficultyTag, setManualDifficultyTag] = useState<ManualDifficultyOption>('auto')
  const [scheduledTime, setScheduledTime] = useState('')

  const [activeTab, setActiveTab] = useState<TabType>('Today')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dismissedScheduledIds, setDismissedScheduledIds] = useState<string[]>([])

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const isDesktopSidebar = useIsDesktopSidebar()
  const todayStr = getLocalToday()
  const hasIncompleteTodos = todos.some((todo) => !todo.completed)

  useEffect(() => {
    const syncMomentum = () => {
      setMomentum((current) =>
        applyIdleMomentumDecay(current, {
          hasIncompleteTasks: hasIncompleteTodos
        })
      )
    }

    syncMomentum()
    const intervalId = window.setInterval(syncMomentum, 60_000)
    return () => window.clearInterval(intervalId)
  }, [hasIncompleteTodos, setMomentum])

  useEffect(() => {
    setDismissedScheduledIds((current) => current.filter((id) => todos.some((todo) => todo.id === id)))
  }, [todos])

  useEffect(() => {
    if (momentumContext.weak_habit_day && momentumContext.weak_habit_day_date !== todayStr) {
      setMomentumContext({
        weak_habit_day: false,
        weak_habit_day_date: todayStr
      })
    }
  }, [momentumContext.weak_habit_day, momentumContext.weak_habit_day_date, setMomentumContext, todayStr])

  const momentumForDisplay = useMemo(
    () =>
      applyIdleMomentumDecay(momentum, {
        hasIncompleteTasks: hasIncompleteTodos
      }),
    [hasIncompleteTodos, momentum]
  )

  const effectiveMomentumContext = useMemo(
    () => ({
      ...momentumContext,
      weak_habit_day: momentumContext.weak_habit_day && momentumContext.weak_habit_day_date === todayStr
    }),
    [momentumContext, todayStr]
  )

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDifficulty(1)
    setDueDate(todayStr)
    setEstimatedMinutes('')
    setManualDifficultyTag('auto')
    setScheduledTime('')
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSave = () => {
    if (!title.trim()) return

    const nextEstimatedMinutes = normalizeEstimatedMinutes(estimatedMinutes)
    const nextDifficultyTag = manualDifficultyTag === 'auto' ? null : manualDifficultyTag
    const nextScheduledTime = scheduledTime || null

    if (editingId) {
      setTodos((prev) =>
        prev.map((todo) =>
          todo.id === editingId
            ? {
                ...todo,
                title,
                description,
                difficulty,
                dueDate,
                estimatedMinutes: nextEstimatedMinutes,
                manualDifficultyTag: nextDifficultyTag,
                scheduledTime: nextScheduledTime
              }
            : todo
        )
      )
      setMomentum((prev) => touchTodoMomentum(prev))
      emitPreChaosAppEvent({
        source: 'todos',
        action: 'todo_updated',
        label: 'Updated a todo item',
        importance: 'medium'
      })
    } else {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        title,
        description,
        difficulty,
        dueDate,
        completed: false,
        createdAt: Date.now(),
        estimatedMinutes: nextEstimatedMinutes,
        manualDifficultyTag: nextDifficultyTag,
        scheduledTime: nextScheduledTime
      }
      setTodos((prev) => [...prev, newTodo])
      setMomentum((prev) => touchTodoMomentum(prev))
      emitPreChaosAppEvent({
        source: 'todos',
        action: 'todo_created',
        label: 'Created a new todo item',
        importance: 'medium'
      })
    }

    resetForm()
  }

  const startEdit = (todo: Todo) => {
    setTitle(todo.title)
    setDescription(todo.description || '')
    setDifficulty(todo.difficulty)
    setDueDate(todo.dueDate)
    setEstimatedMinutes(typeof todo.estimatedMinutes === 'number' ? String(todo.estimatedMinutes) : '')
    setManualDifficultyTag(todo.manualDifficultyTag ?? 'auto')
    setScheduledTime(todo.scheduledTime ?? '')
    setEditingId(todo.id)
    setIsAdding(true)
  }

  const deleteTodo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
    setMomentum((prev) => touchTodoMomentum(prev))
  }

  const toggleStudyTag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, is_study_task: !todo.is_study_task } : todo
      )
    )
  }

  const hasIncompleteStudyTodo = todos.some((todo) => todo.is_study_task && !todo.completed)

  const toggleTodo = (id: string, diff: number) => {
    const targetTodo = todos.find((todo) => todo.id === id)
    if (!targetTodo) return

    const actionAt = new Date()

    setTodos((prev) =>
      prev.map((todo) => {
        if (todo.id !== id) return todo

        if (todo.completed) {
          updateScraps(-scrapRewardForDifficulty(diff))
          return { ...todo, completed: false, completedAt: undefined }
        }

        updateScraps(scrapRewardForDifficulty(diff))
        emitPreChaosAppEvent({
          source: 'todos',
          action: 'todo_completed',
          label: 'Completed a todo task',
          importance: 'high'
        })

        return { ...todo, completed: true, completedAt: Date.now() }
      })
    )

    setMomentum((prev) =>
      targetTodo.completed ? touchTodoMomentum(prev, actionAt) : recordTodoOutcome(prev, 'completed', actionAt)
    )
  }

  const skipTodo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const targetTodo = todos.find((todo) => todo.id === id)
    if (!targetTodo || targetTodo.completed) return
    setMomentum((prev) => recordTodoOutcome(prev, 'skipped'))
  }

  const isDateInTab = (dateStr: string, tab: TabType) => {
    if (tab === 'All') return true

    const date = parseLocalDate(dateStr)
    const today = parseLocalDate(todayStr)

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
      filtered = todos.filter((todo) => todo.dueDate === selectedDate)
    } else {
      filtered = todos.filter((todo) => isDateInTab(todo.dueDate, activeTab))
    }

    return getTodoReorderResult(filtered, momentumForDisplay, effectiveMomentumContext)
  }, [activeTab, effectiveMomentumContext, momentumForDisplay, selectedDate, todos, todayStr])

  const renderStars = (count: number = 0, interactive = false, onClick?: (n: number) => void) => (
    <div className="flex gap-1">
      {[...Array(5)].map((_, i) => (
        <button
          key={i}
          type="button"
          className={interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}
          onClick={(e) => {
            if (interactive && onClick) {
              e.preventDefault()
              const nextRating = count === i + 1 ? 0 : i + 1
              onClick(nextRating)
            }
          }}
          aria-label={`Set difficulty to ${i + 1} star${i === 0 ? '' : 's'}`}
          aria-pressed={interactive ? count === i + 1 : undefined}
        >
          <Star
            className={`w-3 h-3 ${i < count ? 'fill-[var(--nv-primary)] text-[var(--nv-primary)]' : 'text-[var(--nv-subtle)]'}`}
          />
        </button>
      ))}
    </div>
  )

  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]

  const renderMomentumCard = (className = '') => (
    <div className={`rounded-[14px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 flex-col justify-center self-stretch py-2">
          <p className="text-[0.58rem] uppercase tracking-[0.32em] font-bold text-[var(--nv-subtle)]">Momentum</p>
          <p className="mt-3 text-2xl font-semibold text-white">{getMomentumBarLabel(momentumForDisplay.momentum_score)}</p>
          <p className="mt-2 text-[0.58rem] font-bold uppercase tracking-[0.24em] text-[var(--nv-secondary)]">
            live state
          </p>
          {effectiveMomentumContext.weak_habit_day && momentumForDisplay.momentum_score < 60 && (
            <p className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] font-bold text-[var(--nv-primary)]">
              lighter list today
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-64 flex-col justify-between py-3 text-[0.52rem] uppercase tracking-[0.22em] font-bold text-[var(--nv-subtle)]">
            <span>Strong</span>
            <span>Building</span>
            <span>Low</span>
          </div>
          <MomentumLiquidBar value={momentumForDisplay.momentum_score} className="h-64 w-24 shrink-0" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex w-full min-h-screen bg-[var(--nv-bg)]">
      <aside className="hidden lg:flex flex-col w-[24rem] shrink-0 z-10 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto border-r border-[var(--nv-border)] bg-[var(--nv-bg)] items-center pt-4 px-7 no-scrollbar">
        <div className="w-full flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white tracking-widest uppercase font-headline">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1 flex items-center justify-center bg-transparent border border-[var(--nv-border)] text-[var(--nv-subtle)] hover:border-[var(--nv-primary)] hover:text-white rounded-[4px] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1 flex items-center justify-center bg-transparent border border-[var(--nv-border)] text-[var(--nv-subtle)] hover:border-[var(--nv-primary)] hover:text-white rounded-[4px] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 w-full text-center text-[0.6rem] uppercase tracking-widest font-bold text-white mb-3">
          <div>S</div>
          <div>M</div>
          <div>T</div>
          <div>W</div>
          <div>T</div>
          <div>F</div>
          <div>S</div>
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
            const dayTodos = todos.filter((todo) => todo.dueDate === dateStr)
            const hasTodo = dayTodos.filter((todo) => !todo.completed).length > 0 || dayTodos.length > 0

            return (
              <div key={day} className="relative group flex items-center justify-center">
                <button
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`
                    w-8 h-8 rounded flex flex-col items-center justify-center relative transition-colors text-sm
                    ${isSelected ? 'bg-[var(--nv-primary)] text-[var(--nv-foreground)] font-bold' : ''}
                    ${!isSelected && isToday ? 'text-[var(--nv-secondary)] font-bold' : ''}
                    ${!isSelected && !isToday && hasTodo ? 'bg-[var(--nv-secondary-soft)] text-[var(--nv-secondary)] font-medium hover:bg-[var(--nv-secondary-soft)]' : ''}
                    ${!isSelected && !isToday && !hasTodo ? 'border border-transparent text-[var(--nv-muted)] hover:bg-[var(--nv-surface-strong)]' : ''}
                  `}
                >
                  <span>{day}</span>
                  {hasTodo && !isSelected && (
                    <div
                      className={`w-1 h-1 rounded-full absolute bottom-1 ${
                        dayTodos.some((todo) => todo.dueDate < todayStr && !todo.completed)
                          ? 'bg-[var(--nv-danger)]'
                          : 'bg-[var(--nv-secondary)]'
                      }`}
                    />
                  )}
                </button>
                {dayTodos.length > 0 && (
                  <div className="absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full hidden group-hover:flex flex-col gap-2 z-[100] w-48 p-4 bg-[var(--nv-surface-strong)] border border-[var(--nv-border)] shadow-[0_0_16px_rgba(255,86,37,0.2)] rounded-lg pointer-events-none">
                    <p className="text-[0.6rem] uppercase tracking-widest font-bold border-b border-[var(--nv-border)] pb-2 text-[var(--nv-muted)]">
                      {parseLocalDate(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                    {dayTodos.map((todo) => (
                      <div key={todo.id} className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-[2px] flex items-center justify-center shrink-0 border ${
                            todo.completed
                              ? 'bg-[var(--nv-primary)] border-[var(--nv-primary)]'
                              : 'border-[var(--nv-border)] bg-[var(--nv-bg)]'
                          }`}
                        >
                          {todo.completed && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <span className={`text-xs truncate ${todo.completed ? 'text-[var(--nv-muted)] line-through' : 'text-white'}`}>
                          {todo.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {selectedDate && (
          <div className="mt-6 pt-5 border-t border-[var(--nv-border)] w-full">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--nv-muted)] flex items-center gap-2">
                <CalendarIcon className="w-3 h-3" /> Filters
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[0.6rem] uppercase font-bold text-[var(--nv-muted)] hover:text-white"
              >
                Clear
              </button>
            </div>
            <p className="text-sm font-bold text-[var(--nv-secondary)] uppercase tracking-widest">
              {parseLocalDate(selectedDate).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
              })}
            </p>
          </div>
        )}

        {isDesktopSidebar && (
          <div className="mt-6 w-full border-t border-[var(--nv-border)] pt-5">
            {renderMomentumCard()}
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col p-8 md:px-12 md:py-14 w-full h-full relative">
        <div className="w-full flex flex-col gap-8 h-full">
          <div className="flex-1 min-w-0 flex flex-col h-full">
          <header className="pt-8 pb-4 flex flex-col gap-6 w-full border-b border-[var(--nv-border)] mb-8">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[var(--nv-subtle)] mb-1">
                Your Itinerary
              </p>
              <h1 className="text-4xl font-extrabold text-[var(--nv-secondary)] font-headline">To-Do</h1>
            </div>

            <div className="flex gap-6 w-full mt-2">
              {(['Today', 'This Week', 'This Month', 'This Year', 'All'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  className={`py-3 font-semibold text-sm transition-colors uppercase tracking-wider relative ${
                    activeTab === tab && !selectedDate ? 'text-[var(--nv-primary)]' : 'text-[var(--nv-subtle)] hover:text-white'
                  }`}
                  onClick={() => {
                    setActiveTab(tab)
                    setSelectedDate(null)
                  }}
                >
                  {tab}
                  {activeTab === tab && !selectedDate && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-[var(--nv-primary)]" />}
                </button>
              ))}
            </div>
          </header>

          {hasIncompleteStudyTodo && (
            <div className="mb-4 flex items-center gap-3 rounded-[8px] border border-[rgba(255,69,0,0.25)] bg-[rgba(255,69,0,0.06)] px-5 py-3">
              <BookOpen className="h-4 w-4 shrink-0" style={{ color: '#FF4500' }} />
              <span className="text-sm text-[var(--nv-foreground)]">
                Start your study session →{' '}
                <button
                  type="button"
                  onClick={() => void preChaosBridge.openCameraModule()}
                  className="font-bold uppercase tracking-wider transition-colors hover:text-white"
                  style={{ color: '#FF4500' }}
                >
                  Open Camera Module
                </button>
              </span>
            </div>
          )}

          {!isDesktopSidebar && <div className="mb-8">{renderMomentumCard()}</div>}

          <div className="p-8 flex-1 overflow-y-auto w-full">
            {isAdding && (
              <div className="mb-8 p-6 bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-[8px] relative">
                <button
                  onClick={resetForm}
                  className="absolute top-4 right-4 text-[var(--nv-subtle)] hover:text-white transition-colors bg-transparent border-none"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest">
                  {editingId ? 'Edit Task' : 'Create New Task'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white placeholder:text-[var(--nv-subtle)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add details..."
                      className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white placeholder:text-[var(--nv-subtle)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full rounded px-4 py-3 text-[var(--nv-primary)] bg-[var(--nv-bg)] border border-[var(--nv-border)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Estimated Time
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(e.target.value)}
                      placeholder="e.g. 25"
                      className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white placeholder:text-[var(--nv-subtle)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Task Weight
                    </label>
                    <select
                      value={manualDifficultyTag}
                      onChange={(e) => setManualDifficultyTag(e.target.value as ManualDifficultyOption)}
                      className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded px-4 py-3 text-white focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm"
                    >
                      <option value="auto">Auto from time</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-2">
                      Scheduled Time (Optional)
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full rounded px-4 py-3 text-[var(--nv-primary)] bg-[var(--nv-bg)] border border-[var(--nv-border)] focus:outline-none focus:border-[var(--nv-primary)] transition-all text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-[var(--nv-subtle)] mb-3">
                      Difficulty & Reward
                    </label>
                    <div className="flex items-center gap-4 bg-[var(--nv-bg)] p-4 rounded border border-[var(--nv-border)] w-fit">
                      {renderStars(difficulty, true, setDifficulty)}
                      <div className="w-px h-6 bg-[var(--nv-border)]" />
                      <span className="text-[0.6rem] font-bold text-[var(--nv-subtle)] uppercase tracking-widest">
                        +{scrapRewardForDifficulty(difficulty)} SCRAPS
                      </span>
                    </div>
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
                    className="bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft-strong)] disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-bold transition-all uppercase tracking-widest"
                  >
                    {editingId ? 'Save Changes' : 'Create Task'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4 pb-20">
              {filteredTodos.orderedTodos.length > 0 ? (
                filteredTodos.orderedTodos.map((entry) => {
                  const todo = entry.todo
                  const isLate = !todo.completed && todo.dueDate < todayStr
                  const difficultyTag = getTodoDifficultyTag(todo)
                  const isScheduledDismissed = entry.label === 'scheduled' && dismissedScheduledIds.includes(todo.id)
                  const shouldShowNote =
                    Boolean(entry.note) && (!isScheduledDismissed || entry.showReorderHint || entry.label === 'save for later')

                  return (
                    <div
                      key={todo.id}
                      className={`group rounded-[8px] border bg-[var(--nv-surface)] p-6 transition-all cursor-pointer hover:border-[var(--nv-primary)] hover:shadow-[0_0_20px_var(--nv-primary-glow)] ${
                        todo.completed
                          ? 'border-[var(--nv-border)] opacity-40'
                          : isLate
                            ? 'border-[var(--nv-primary)] bg-[var(--nv-surface)] shadow-[0_0_12px_var(--nv-primary-glow)]'
                            : 'border-[var(--nv-border)]'
                      }`}
                      onClick={() => toggleTodo(todo.id, todo.difficulty)}
                    >
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-6 w-full min-w-0">
                          <div
                            className={`w-6 h-6 shrink-0 rounded-[2px] flex items-center justify-center transition-colors ${
                              todo.completed
                                ? 'border-[var(--nv-primary)] bg-[var(--nv-primary)]'
                                : isLate
                                  ? 'border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] group-hover:bg-[var(--nv-primary)]'
                                  : 'border border-[var(--nv-border)] group-hover:border-[var(--nv-primary)]'
                            }`}
                          >
                            {todo.completed && <Check className="w-4 h-4 text-white font-bold" strokeWidth={3} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h3 className={`font-semibold text-sm transition-colors ${todo.completed ? 'text-white line-through' : 'text-white'}`}>
                                  <span className="flex items-center gap-2">
                                    {todo.title}
                                    <button
                                      type="button"
                                      onClick={(e) => toggleStudyTag(todo.id, e)}
                                      className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${
                                        todo.is_study_task
                                          ? 'text-[#FF4500]'
                                          : 'text-[var(--nv-subtle)] opacity-40 hover:opacity-80'
                                      }`}
                                      title={todo.is_study_task ? 'Remove study tag' : 'Tag as study task'}
                                    >
                                      <BookOpen className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                </h3>
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                                  <span
                                    className={`flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-widest ${
                                      todo.completed
                                        ? 'text-[var(--nv-subtle)]'
                                        : isLate
                                          ? 'text-[var(--nv-primary)]'
                                          : 'text-[var(--nv-subtle)]'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    {todo.dueDate === todayStr
                                      ? 'Today'
                                      : parseLocalDate(todo.dueDate).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric'
                                        })}
                                    {isLate && ' (Overdue)'}
                                  </span>
                                  {todo.estimatedMinutes && <span className="text-[var(--nv-subtle)]">{todo.estimatedMinutes} min</span>}
                                  <span className="text-[var(--nv-subtle)] capitalize">{difficultyTag}</span>
                                  {todo.scheduledTime && (
                                    <span className="text-[var(--nv-subtle)]">at {formatScheduledTime(todo.scheduledTime)}</span>
                                  )}
                                  {todo.description && (
                                    <span className="truncate max-w-[200px] text-[var(--nv-subtle)]">- {todo.description}</span>
                                  )}
                                </div>
                              </div>
                              {entry.label && !todo.completed && (
                                <span
                                  className={`shrink-0 text-[0.6rem] font-bold uppercase tracking-[0.22em] ${getSuggestionTone(entry.label)}`}
                                >
                                  {entry.label}
                                </span>
                              )}
                            </div>

                            {shouldShowNote && (
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="text-xs text-[var(--nv-subtle)]">{entry.note}</p>
                                {entry.label === 'scheduled' && !todo.completed && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDismissedScheduledIds((current) => [...new Set([...current, todo.id])])
                                    }}
                                    className="text-[0.6rem] uppercase tracking-[0.22em] font-bold text-[var(--nv-subtle)] hover:text-white"
                                  >
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="mt-3">{renderStars(todo.difficulty)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-end justify-center h-full">
                            <span className="text-[0.6rem] font-bold text-[var(--nv-secondary)] uppercase flex items-center gap-1">
                              +{scrapRewardForDifficulty(todo.difficulty)} <NetheriteScrapIcon size={10} />
                            </span>
                            {todo.completedAt && (
                              <span className="mt-1 text-[0.55rem] uppercase tracking-[0.18em] text-[var(--nv-subtle)]">
                                done {getLocalDateString(todo.completedAt)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!todo.completed && (
                              <button
                                onClick={(e) => skipTodo(todo.id, e)}
                                className="flex items-center gap-1 h-8 px-3 justify-center rounded-[4px] border border-[var(--nv-border)] bg-transparent text-[var(--nv-subtle)] transition-colors hover:border-[var(--nv-secondary)] hover:text-white"
                              >
                                <SkipForward className="w-3.5 h-3.5" />
                                <span className="text-[0.6rem] uppercase tracking-[0.18em] font-bold">Skip</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                startEdit(todo)
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--nv-border)] bg-transparent text-[var(--nv-subtle)] transition-colors hover:border-[var(--nv-primary)] hover:text-white"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => deleteTodo(todo.id, e)}
                              className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--nv-border)] bg-transparent text-[var(--nv-subtle)] transition-colors hover:border-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-20 border border-dashed border-[var(--nv-border)] bg-[var(--nv-surface)] rounded-[8px]">
                  <Check className="w-12 h-12 text-[var(--nv-subtle)] mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">
                    {selectedDate ? 'No tasks on this date' : 'All clear!'}
                  </h3>
                  <p className="text-[var(--nv-subtle)] text-sm mb-6 max-w-sm mx-auto">
                    Take a break or create a new task to earn more scraps.
                  </p>
                  <button
                    onClick={() => setIsAdding(true)}
                    className="bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft-strong)] px-6 py-2 rounded-lg text-sm font-bold transition-all uppercase tracking-widest"
                  >
                    Create a Task
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </main>
    </div>
  )
}
