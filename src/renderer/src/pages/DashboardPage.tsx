import { useEffect, useState } from 'react'
import { PixelCharacter } from '@/components/dashboard/PixelCharacter'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { Flame, CheckSquare, BookOpen, ShoppingBag, Sword, Heart, Wand2, Brain } from 'lucide-react'
import { useProfile, useScraps, useStreak, useTodos, useHabits } from '@/hooks/use-data'
import { formatLocalDate, getLocalToday } from '@/lib/date'
import { defaultVaultConfig, getCurrentVaultPath, loadVaultConfig } from '@/lib/vault-config'
import { DashboardRiskWidget } from '@/prechaos/DashboardRiskWidget'

const nextUnlocks = [
  { name: "Shadow Gi", price: 250, rarity: "Rare", color: "#4a6fa5" },
  { name: "Ember Wraps", price: 500, rarity: "Epic", color: "#9b59b6" },
  { name: "Dragon Scale", price: 1200, rarity: "Legendary", color: "#ff5625" },
]

const rarityColors: Record<string, { text: string }> = {
  Rare: { text: "text-blue-400" },
  Epic: { text: "text-purple-400" },
  Legendary: { text: "text-[var(--nv-primary)]" },
}

// Mock flashcard data until integration
const mockDecks = [
  { name: 'DSA Concepts', dueToday: 8, newCards: 3 },
  { name: 'OS Notes', dueToday: 12, newCards: 5 },
]

// Character stat definitions
const characterStats = [
  { name: 'STR', label: 'Strength', value: 12, max: 50, icon: Sword, color: 'var(--nv-primary)' },
  { name: 'HP', label: 'Health', value: 30, max: 50, icon: Heart, color: 'var(--nv-danger)' },
  { name: 'MAG', label: 'Magic', value: 8, max: 50, icon: Wand2, color: '#9b59b6' },
  { name: 'INT', label: 'Intelligence', value: 18, max: 50, icon: Brain, color: 'var(--nv-secondary)' },
]

export default function DashboardPage() {
  const [profile] = useProfile()
  const [scraps] = useScraps()
  const [streak] = useStreak()
  const [todos] = useTodos()
  const [habits] = useHabits()
  const [showVaultStats, setShowVaultStats] = useState(defaultVaultConfig.preferences.showVaultStats)

  const todayStr = getLocalToday()

  const level = Math.max(1, Math.floor(Math.sqrt(scraps / 100)) + 1)
  const currentLevelMaxXP = Math.pow(level, 2) * 100
  const prevLevelMaxXP = Math.pow(level - 1, 2) * 100
  const xpIntoCurrentLevel = scraps - prevLevelMaxXP
  const xpNeededForCurrentLevel = currentLevelMaxXP - prevLevelMaxXP
  const xpPercentage = Math.min(100, Math.max(0, (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100))

  // Today's data
  const todayTodos = todos.filter(t => t.dueDate === todayStr)
  const todayTodosCompleted = todayTodos.filter(t => t.completed).length

  const todayHabitsCompleted = habits.filter(h => h.completedDates.includes(todayStr)).length

  const totalFlashcardsDue = mockDecks.reduce((s, d) => s + d.dueToday, 0)
  const totalFlashcardsNew = mockDecks.reduce((s, d) => s + d.newCards, 0)

  useEffect(() => {
    let cancelled = false

    const syncVaultPreferences = async () => {
      const vaultPath = getCurrentVaultPath()

      if (!vaultPath) {
        if (!cancelled) {
          setShowVaultStats(defaultVaultConfig.preferences.showVaultStats)
        }
        return
      }

      try {
        const config = await loadVaultConfig(vaultPath)
        if (!cancelled) {
          setShowVaultStats(config.preferences.showVaultStats)
        }
      } catch {
        if (!cancelled) {
          setShowVaultStats(defaultVaultConfig.preferences.showVaultStats)
        }
      }
    }

    void syncVaultPreferences()

    const handleStorageUpdate = () => {
      void syncVaultPreferences()
    }

    window.addEventListener('local-storage', handleStorageUpdate)
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      cancelled = true
      window.removeEventListener('local-storage', handleStorageUpdate)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [])

  // Calculate streaks for each section
  const todoStreak = (() => {
    let count = 0
    const d = new Date()
    for (let i = 0; i < 30; i++) {
      const dateStr = formatLocalDate(d)
      const dayTodos = todos.filter(t => t.dueDate === dateStr)
      if (dayTodos.length > 0 && dayTodos.every(t => t.completed)) {
        count++
      } else if (dayTodos.length > 0) {
        break
      }
      d.setDate(d.getDate() - 1)
    }
    return count
  })()

  const habitStreak = (() => {
    let count = 0
    const d = new Date()
    for (let i = 0; i < 30; i++) {
      const dateStr = formatLocalDate(d)
      if (habits.length > 0 && habits.every(h => h.completedDates.includes(dateStr))) {
        count++
      } else if (habits.length > 0) {
        break
      }
      d.setDate(d.getDate() - 1)
    }
    return count
  })()

  return (
    <div className="flex h-full w-full bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      
      {/* Main Content - 4 box grid */}
      <main className="flex-1 flex flex-col p-8 md:p-12 overflow-y-auto no-scrollbar">
        {/* Welcome Header */}
        <div className="mb-10">
          <p className="mb-1 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-subtle)]">Command Center</p>
          <h1 className="font-headline text-3xl font-extrabold text-[var(--nv-foreground)]">
            Welcome back, <span className="text-[var(--nv-secondary)]">{profile.name || "Adventurer"}</span>
          </h1>
        </div>

        {/* 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 max-w-4xl">
          
          {/* To-Do */}
          <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-6 flex flex-col hover:border-[var(--nv-primary)] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[var(--nv-primary-soft)] rounded-lg flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-[var(--nv-primary)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--nv-primary)] uppercase tracking-wider">To-Do</h3>
                  {todoStreak > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--nv-primary-soft)] rounded">
                      <Flame className="w-3 h-3 text-[var(--nv-primary)]" />
                      <span className="text-[0.5rem] font-bold text-[var(--nv-primary)]">{todoStreak}</span>
                    </div>
                  )}
                </div>
                <p className="text-[0.55rem] text-[var(--nv-subtle)] uppercase tracking-widest font-bold">{todayTodosCompleted}/{todayTodos.length} done</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {todayTodos.length > 0 ? (
                todayTodos.map(todo => (
                  <div key={todo.id} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${todo.completed ? 'text-[var(--nv-subtle)] line-through' : 'text-[var(--nv-foreground)]'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${todo.completed ? 'bg-[var(--nv-primary)]' : 'bg-[var(--nv-border)]'}`} />
                    <span className="truncate">{todo.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--nv-subtle)]">No tasks due today</p>
              )}
            </div>
          </div>

          {/* Habits */}
          <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-6 flex flex-col hover:border-[var(--nv-primary)] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[var(--nv-danger-soft)] rounded-lg flex items-center justify-center">
                <Flame className="w-4 h-4 text-[var(--nv-danger)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--nv-danger)] uppercase tracking-wider">Habits</h3>
                  {habitStreak > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--nv-danger-soft)] rounded">
                      <Flame className="w-3 h-3 text-[var(--nv-danger)]" />
                      <span className="text-[0.5rem] font-bold text-[var(--nv-danger)]">{habitStreak}</span>
                    </div>
                  )}
                </div>
                <p className="text-[0.55rem] text-[var(--nv-subtle)] uppercase tracking-widest font-bold">{todayHabitsCompleted}/{habits.length} done</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {habits.length > 0 ? (
                habits.map(habit => {
                  const done = habit.completedDates.includes(todayStr)
                  return (
                    <div key={habit.id} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${done ? 'text-[var(--nv-subtle)] line-through' : 'text-[var(--nv-foreground)]'}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-[var(--nv-danger)]' : 'bg-[var(--nv-border)]'}`} />
                      <span className="truncate">{habit.title}</span>
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-[var(--nv-subtle)]">No habits created yet</p>
              )}
            </div>
          </div>

          {/* Flashcard Due */}
          <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-6 flex flex-col hover:border-[var(--nv-primary)] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[var(--nv-secondary-soft)] rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-[var(--nv-secondary)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--nv-secondary)] uppercase tracking-wider">Flashcards</h3>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--nv-secondary-soft)] rounded">
                    <Flame className="w-3 h-3 text-[var(--nv-secondary)]" />
                    <span className="text-[0.5rem] font-bold text-[var(--nv-secondary)]">12</span>
                  </div>
                </div>
                <p className="text-[0.55rem] text-[var(--nv-subtle)] uppercase tracking-widest font-bold">{totalFlashcardsDue} due · {totalFlashcardsNew} new</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {mockDecks.map((deck, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-sm text-[var(--nv-foreground)]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--nv-secondary)] shrink-0" />
                    <span className="truncate">{deck.name}</span>
                  </div>
                  <span className="text-[0.55rem] font-bold text-[var(--nv-danger)] uppercase shrink-0">{deck.dueToday} due</span>
                </div>
              ))}
            </div>
          </div>

          <DashboardRiskWidget />

        </div>
      </main>

      {/* Right Sidebar — Character + Stats */}
      <aside className={`${showVaultStats ? 'flex' : 'hidden'} h-[calc(100vh-48px)] w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--nv-border)] bg-[var(--nv-bg)] no-scrollbar`}>
        
        {/* Character Display */}
        <div className="flex flex-col items-center p-6 relative">
          <div className="flex items-start gap-4 w-full">
            {/* Character */}
            <div className="flex flex-col items-center flex-1">
              <div className="char-bounce w-[10rem] h-[10rem] z-10">
                <PixelCharacter gender={profile.gender} />
              </div>
              <div className="w-24 h-3 bg-black/40 blur-md rounded-full mt-[-6px]" />
              
              {/* Class Badge */}
              <div className="mt-3 px-4 py-1.5 bg-[var(--nv-secondary-soft)] border border-[var(--nv-secondary)] rounded-lg">
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-secondary)]">Beginner</span>
              </div>
            </div>

            {/* Character Stats */}
            <div className="flex min-w-[118px] flex-col gap-3.5 pt-2">
              {characterStats.map((stat) => {
                const StatIcon = stat.icon
                const pct = Math.min(100, (stat.value / stat.max) * 100)
                return (
                  <div
                    key={stat.name}
                    className="border border-[var(--nv-border)] bg-[rgba(18,14,14,0.92)] px-2.5 py-2 shadow-[0_0_16px_rgba(0,0,0,0.2)]"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center border border-[var(--nv-border)] bg-black/35"
                        style={{ boxShadow: `0 0 10px ${stat.color}25` }}
                      >
                        <StatIcon className="h-3 w-3" style={{ color: stat.color }} />
                      </div>
                      <span className="text-[0.58rem] font-black uppercase tracking-[0.24em] text-[var(--nv-foreground)]">
                        {stat.name}
                      </span>
                      <span
                        className="ml-auto text-[0.65rem] font-black"
                        style={{ color: stat.color, textShadow: `0 0 10px ${stat.color}55` }}
                      >
                        {stat.value}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden border border-[var(--nv-border)] bg-[var(--nv-surface-strong)]">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: stat.color,
                          backgroundImage: `repeating-linear-gradient(90deg, ${stat.color} 0 9px, rgba(255,255,255,0.18) 9px 10px)`,
                          boxShadow: `0 0 10px ${stat.color}80`
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[0.5rem] font-bold uppercase tracking-[0.22em] text-[var(--nv-secondary)]/90">
                      {stat.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6 border-t border-[var(--nv-border)] space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[var(--nv-secondary-soft)] rounded-lg flex items-center justify-center">
              <span className="text-[var(--nv-secondary)] font-extrabold text-sm font-headline">{level}</span>
            </div>
            <div className="flex flex-col flex-1">
              <p className="text-sm font-bold text-white uppercase tracking-widest font-headline">Level {level}</p>
              <div className="flex justify-between text-[0.55rem] uppercase tracking-widest font-bold text-[var(--nv-subtle)] mt-1">
                <span>{xpIntoCurrentLevel} XP</span>
                <span>{currentLevelMaxXP} XP</span>
              </div>
              <div className="h-1 bg-[var(--nv-surface-strong)] border border-[var(--nv-border)] rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-[var(--nv-primary)] rounded-full shadow-[0_0_6px_var(--nv-primary-glow)] transition-all duration-500"
                  style={{ width: `${xpPercentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--nv-surface-strong)] rounded-lg border border-[var(--nv-border)]">
            <div className="flex items-center gap-2">
              <NetheriteScrapIcon size={16} />
              <span className="text-sm font-bold text-white font-headline">{scraps || 0}</span>
              <span className="text-[0.55rem] uppercase tracking-widest font-bold text-[var(--nv-muted)]">Scraps</span>
            </div>
            <ShoppingBag className="w-4 h-4 text-[var(--nv-secondary)]" />
          </div>
        </div>

        {/* Next Unlocks */}
        <div className="p-6 border-t border-[var(--nv-border)]">
          <h3 className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[var(--nv-muted)] mb-4">Next Unlocks</h3>
          <div className="space-y-3">
            {nextUnlocks.map((item) => {
              const rarity = rarityColors[item.rarity]
              return (
                <div key={item.name} className="flex items-center gap-3 p-3 bg-[var(--nv-surface-strong)] border border-[var(--nv-border)] rounded-lg group hover:border-[var(--nv-primary)] transition-all">
                  {/* Item thumbnail instead of Lock */}
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center shrink-0 border border-[var(--nv-border)]"
                    style={{ background: `linear-gradient(135deg, ${item.color}30, ${item.color}10)` }}
                  >
                    <div
                      className="w-4 h-4 rounded-sm"
                      style={{
                        background: `linear-gradient(135deg, ${item.color}, ${item.color}80)`,
                        boxShadow: `0 0 6px ${item.color}40`,
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{item.name}</p>
                    <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${rarity.text}`}>{item.rarity}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[0.6rem] font-bold text-[var(--nv-secondary)] uppercase tracking-wider">{item.price}</span>
                    <NetheriteScrapIcon size={12} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}
