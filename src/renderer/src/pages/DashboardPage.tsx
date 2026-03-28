import { useEffect, useState } from 'react'
import { PixelCharacter } from '@/components/dashboard/PixelCharacter'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { Flame, CheckSquare, BookOpen, Zap, ShoppingBag, Sparkles, Sword, Heart, Wand2, Brain } from 'lucide-react'
import { useProfile, useScraps, useStreak, useTodos, useHabits } from '@/hooks/use-data'
import { formatLocalDate, getLocalToday } from '@/lib/date'
import { defaultVaultConfig, getCurrentVaultPath, loadVaultConfig } from '@/lib/vault-config'

const nextUnlocks = [
  { name: "Shadow Gi", price: 250, rarity: "Rare", color: "#4a6fa5" },
  { name: "Ember Wraps", price: 500, rarity: "Epic", color: "#9b59b6" },
  { name: "Dragon Scale", price: 1200, rarity: "Legendary", color: "#ff5625" },
]

const rarityColors: Record<string, { text: string }> = {
  Rare: { text: "text-blue-400" },
  Epic: { text: "text-purple-400" },
  Legendary: { text: "text-[#ff5625]" },
}

// Mock flashcard data until integration
const mockDecks = [
  { name: 'DSA Concepts', dueToday: 8, newCards: 3 },
  { name: 'OS Notes', dueToday: 12, newCards: 5 },
]

// Character stat definitions
const characterStats = [
  { name: 'STR', label: 'Strength', value: 12, max: 50, icon: Sword, color: '#ff5625' },
  { name: 'HP', label: 'Health', value: 30, max: 50, icon: Heart, color: '#ff5449' },
  { name: 'MAG', label: 'Magic', value: 8, max: 50, icon: Wand2, color: '#9b59b6' },
  { name: 'INT', label: 'Intelligence', value: 18, max: 50, icon: Brain, color: '#ffb77d' },
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
          <div className="bg-[#111111] border border-[#1f1d1d] rounded-lg p-6 flex flex-col hover:border-[#2a2422] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[rgba(255,86,37,0.1)] rounded-lg flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-[#ff5625]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#ff5625] uppercase tracking-wider">To-Do</h3>
                  {todoStreak > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[rgba(255,86,37,0.08)] rounded">
                      <Flame className="w-3 h-3 text-[#ff5625]" />
                      <span className="text-[0.5rem] font-bold text-[#ff5625]">{todoStreak}</span>
                    </div>
                  )}
                </div>
                <p className="text-[0.55rem] text-[#444444] uppercase tracking-widest font-bold">{todayTodosCompleted}/{todayTodos.length} done</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {todayTodos.length > 0 ? (
                todayTodos.map(todo => (
                  <div key={todo.id} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${todo.completed ? 'text-[#444444] line-through' : 'text-[#e0dcd8]'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${todo.completed ? 'bg-[#ff5625]' : 'bg-[#2a2422]'}`} />
                    <span className="truncate">{todo.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#444444]">No tasks due today</p>
              )}
            </div>
          </div>

          {/* Habits */}
          <div className="bg-[#111111] border border-[#1f1d1d] rounded-lg p-6 flex flex-col hover:border-[#2a2422] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[rgba(255,84,73,0.1)] rounded-lg flex items-center justify-center">
                <Flame className="w-4 h-4 text-[#ff5449]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#ff5449] uppercase tracking-wider">Habits</h3>
                  {habitStreak > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[rgba(255,84,73,0.08)] rounded">
                      <Flame className="w-3 h-3 text-[#ff5449]" />
                      <span className="text-[0.5rem] font-bold text-[#ff5449]">{habitStreak}</span>
                    </div>
                  )}
                </div>
                <p className="text-[0.55rem] text-[#444444] uppercase tracking-widest font-bold">{todayHabitsCompleted}/{habits.length} done</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {habits.length > 0 ? (
                habits.map(habit => {
                  const done = habit.completedDates.includes(todayStr)
                  return (
                    <div key={habit.id} className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${done ? 'text-[#444444] line-through' : 'text-[#e0dcd8]'}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-[#ff5449]' : 'bg-[#2a2422]'}`} />
                      <span className="truncate">{habit.title}</span>
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-[#444444]">No habits created yet</p>
              )}
            </div>
          </div>

          {/* Flashcard Due */}
          <div className="bg-[#111111] border border-[#1f1d1d] rounded-lg p-6 flex flex-col hover:border-[#2a2422] transition-colors max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[rgba(255,183,125,0.1)] rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-[#ffb77d]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#ffb77d] uppercase tracking-wider">Flashcards</h3>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[rgba(255,183,125,0.08)] rounded">
                    <Flame className="w-3 h-3 text-[#ffb77d]" />
                    <span className="text-[0.5rem] font-bold text-[#ffb77d]">12</span>
                  </div>
                </div>
                <p className="text-[0.55rem] text-[#444444] uppercase tracking-widest font-bold">{totalFlashcardsDue} due · {totalFlashcardsNew} new</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5">
              {mockDecks.map((deck, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-sm text-[#e0dcd8]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ffb77d] shrink-0" />
                    <span className="truncate">{deck.name}</span>
                  </div>
                  <span className="text-[0.55rem] font-bold text-[#ff5449] uppercase shrink-0">{deck.dueToday} due</span>
                </div>
              ))}
            </div>
          </div>

          {/* Focus Meter */}
          <div className="bg-[#111111] border border-[#1f1d1d] rounded-lg p-6 flex flex-col hover:border-[#2a2422] transition-colors relative overflow-hidden max-h-[280px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[rgba(255,255,255,0.05)] rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Focus Meter</h3>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end gap-3">
              <div className="h-2 bg-[#0a0808] border border-[#2a2422] rounded-full overflow-hidden">
                <div className="h-full w-[0%] bg-gradient-to-r from-[#ff5449] via-[#ff5625] to-[#ffb77d] rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-[#444444]" />
                <span className="text-[0.6rem] uppercase tracking-widest font-bold text-[#444444]">Coming Soon</span>
              </div>
            </div>
          </div>

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
              <div className="mt-3 px-4 py-1.5 bg-[rgba(255,183,125,0.1)] border border-[#ffb77d]/20 rounded-lg">
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[#ffb77d]">Beginner</span>
              </div>
            </div>

            {/* Character Stats */}
            <div className="flex flex-col gap-2 pt-2 min-w-[90px]">
              {characterStats.map((stat) => {
                const StatIcon = stat.icon
                const pct = Math.min(100, (stat.value / stat.max) * 100)
                return (
                  <div key={stat.name} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <StatIcon className="w-3 h-3" style={{ color: stat.color }} />
                      <span className="text-[0.5rem] font-bold uppercase tracking-wider text-[#a8a0a0]">{stat.name}</span>
                      <span className="text-[0.5rem] font-bold ml-auto" style={{ color: stat.color }}>{stat.value}</span>
                    </div>
                    <div className="h-1 bg-[#141212] border border-[#2a2422] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: stat.color, boxShadow: `0 0 4px ${stat.color}40` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6 border-t border-[#2a2422] space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[rgba(255,183,125,0.1)] rounded-lg flex items-center justify-center">
              <span className="text-[#ffb77d] font-extrabold text-sm font-headline">{level}</span>
            </div>
            <div className="flex flex-col flex-1">
              <p className="text-sm font-bold text-white uppercase tracking-widest font-headline">Level {level}</p>
              <div className="flex justify-between text-[0.55rem] uppercase tracking-widest font-bold text-[#444444] mt-1">
                <span>{xpIntoCurrentLevel} XP</span>
                <span>{currentLevelMaxXP} XP</span>
              </div>
              <div className="h-1 bg-[#141212] border border-[#2a2422] rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-[#ff5625] rounded-full shadow-[0_0_6px_rgba(255,86,37,0.5)] transition-all duration-500"
                  style={{ width: `${xpPercentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#141212] rounded-lg border border-[#2a2422]">
            <div className="flex items-center gap-2">
              <NetheriteScrapIcon size={16} />
              <span className="text-sm font-bold text-white font-headline">{scraps || 0}</span>
              <span className="text-[0.55rem] uppercase tracking-widest font-bold text-[#a8a0a0]">Scraps</span>
            </div>
            <ShoppingBag className="w-4 h-4 text-[#ffb77d]" />
          </div>
        </div>

        {/* Next Unlocks */}
        <div className="p-6 border-t border-[#2a2422]">
          <h3 className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[#a8a0a0] mb-4">Next Unlocks</h3>
          <div className="space-y-3">
            {nextUnlocks.map((item) => {
              const rarity = rarityColors[item.rarity]
              return (
                <div key={item.name} className="flex items-center gap-3 p-3 bg-[#141212] border border-[#2a2422] rounded-lg group hover:border-[#ff5625]/30 transition-all">
                  {/* Item thumbnail instead of Lock */}
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center shrink-0 border border-[#2a2422]"
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
                    <span className="text-[0.6rem] font-bold text-[#ffb77d] uppercase tracking-wider">{item.price}</span>
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
