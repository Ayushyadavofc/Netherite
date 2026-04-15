import { useEffect, useState } from 'react'

import { CharacterViewer } from '@/components/gacha/CharacterViewer'
import { StreakCalendarStrip } from '@/components/gacha/StreakCalendarStrip'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { StackedCardsIcon } from '@/components/ui/StackedCardsIcon'
import { Flame, CheckSquare } from 'lucide-react'
import { ACCOUNT_DATA_EVENT, LOCAL_STORAGE_EVENT, type LocalStorageChangeDetail } from '@/hooks/use-data'
import { useProfile, useScraps, useStats, useStreak, useTodos, useHabits } from '@/hooks/use-data'
import { formatLocalDate, getLocalToday } from '@/lib/date'
import { FLASHCARDS_DATA_EVENT, loadFlashcardDeckSummaries, type FlashcardDeckSummary } from '@/lib/flashcards-data'
import { defaultVaultConfig, getCurrentVaultPath, loadVaultConfig } from '@/lib/vault-config'
import { DashboardRiskWidget } from '@/prechaos/DashboardRiskWidget'
import { resolveCharacterId } from '@/lib/characters'
import { useGachaStore } from '@/stores/gachaStore'

export default function DashboardPage() {
  const [profile] = useProfile()
  const [scraps] = useScraps()
  const [stats] = useStats()
  const [streak] = useStreak()
  const [todos] = useTodos()
  const [habits] = useHabits()
  const [showVaultStats, setShowVaultStats] = useState(defaultVaultConfig.preferences.showVaultStats)
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeckSummary[]>([])
  const [isFlashcardsLoading, setIsFlashcardsLoading] = useState(true)
  
  const selectedCharacter = resolveCharacterId(
    useGachaStore((state) => state.selectedCharacter),
    profile.gender
  )

  const todayStr = getLocalToday()
  const derivedLevel = Math.max(1, Math.floor(Math.sqrt(scraps / 100)) + 1)
  const level = Math.max(stats.level || 1, derivedLevel)
  const totalXp = stats.xp || scraps
  const currentLevelMaxXP = Math.pow(level, 2) * 100
  const prevLevelMaxXP = Math.pow(level - 1, 2) * 100
  const xpIntoCurrentLevel = Math.max(0, totalXp - prevLevelMaxXP)
  const xpNeededForCurrentLevel = Math.max(1, currentLevelMaxXP - prevLevelMaxXP)
  const xpPercentage = Math.min(100, Math.max(0, (xpIntoCurrentLevel / xpNeededForCurrentLevel) * 100))

  const characterStats = [
    { label: 'STR', value: stats.str || 12, color: '#f43f5e' },
    { label: 'HP', value: stats.end || 30, color: '#22c55e' },
    { label: 'MAG', value: Math.max(1, Math.round((stats.int || 12) * 0.8)), color: '#3b82f6' },
    { label: 'INT', value: stats.int || 18, color: '#a855f7' }
  ]
  const sidebarStatBars = characterStats.map((stat) => ({
    ...stat,
    width: `${Math.min(100, Math.max(18, (stat.value / 40) * 100))}%`
  }))

  const todayTodos = todos.filter((todo) => todo.dueDate === todayStr)
  const todayTodosCompleted = todayTodos.filter((todo) => todo.completed).length
  const todayHabitsCompleted = habits.filter((habit) => habit.completedDates.includes(todayStr)).length

  const totalFlashcardsDue = flashcardDecks.reduce((sum, deck) => sum + deck.dueToday, 0)
  const totalFlashcardsNew = flashcardDecks.reduce((sum, deck) => sum + deck.newCards, 0)
  const activeFlashcardDecks = flashcardDecks.filter((deck) => deck.dueToday > 0 || deck.newCards > 0).length

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

    const handleVaultPathChange = (event?: Event) => {
      if (event instanceof StorageEvent) {
        if (event.key && event.key !== 'netherite-current-vault-path') {
          return
        }
      } else if (event) {
        const detail = (event as CustomEvent<LocalStorageChangeDetail>).detail
        if (detail?.key && detail.key !== 'netherite-current-vault-path') {
          return
        }
      }
      void syncVaultPreferences()
    }
    const handleThemeAccountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ filename?: string }>).detail
      if (detail && detail.filename !== '*' && detail.filename !== 'themes') {
        return
      }
      void syncVaultPreferences()
    }

    window.addEventListener(LOCAL_STORAGE_EVENT, handleVaultPathChange)
    window.addEventListener('storage', handleVaultPathChange)
    window.addEventListener(ACCOUNT_DATA_EVENT, handleThemeAccountChange)

    return () => {
      cancelled = true
      window.removeEventListener(LOCAL_STORAGE_EVENT, handleVaultPathChange)
      window.removeEventListener('storage', handleVaultPathChange)
      window.removeEventListener(ACCOUNT_DATA_EVENT, handleThemeAccountChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncFlashcardDecks = async () => {
      const decks = await loadFlashcardDeckSummaries()
      if (!cancelled) {
        setFlashcardDecks(decks)
        setIsFlashcardsLoading(false)
      }
    }

    void syncFlashcardDecks()

    const handleDeckUpdate = () => {
      void syncFlashcardDecks()
    }

    window.addEventListener(FLASHCARDS_DATA_EVENT, handleDeckUpdate)
    window.addEventListener('focus', handleDeckUpdate)

    return () => {
      cancelled = true
      window.removeEventListener(FLASHCARDS_DATA_EVENT, handleDeckUpdate)
      window.removeEventListener('focus', handleDeckUpdate)
    }
  }, [])

  const todoStreak = (() => {
    let count = 0
    const date = new Date()
    for (let index = 0; index < 30; index += 1) {
      const dateStr = formatLocalDate(date)
      const dayTodos = todos.filter((todo) => todo.dueDate === dateStr)
      if (dayTodos.length > 0 && dayTodos.every((todo) => todo.completed)) {
        count += 1
      } else if (dayTodos.length > 0) {
        break
      }
      date.setDate(date.getDate() - 1)
    }
    return count
  })()

  const habitStreak = (() => {
    let count = 0
    const date = new Date()
    for (let index = 0; index < 30; index += 1) {
      const dateStr = formatLocalDate(date)
      if (habits.length > 0 && habits.every((habit) => habit.completedDates.includes(dateStr))) {
        count += 1
      } else if (habits.length > 0) {
        break
      }
      date.setDate(date.getDate() - 1)
    }
    return count
  })()

  return (
    <div className="flex h-full w-full bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      <main className="flex-1 overflow-y-auto p-8 md:p-12 no-scrollbar">
        <div className="mb-10">
          <p className="mb-1 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-subtle)]">Command Center</p>
          <h1 className="font-headline text-3xl font-extrabold text-[var(--nv-foreground)]">
            Welcome back, <span className="text-[var(--nv-secondary)]">{profile.name || 'Adventurer'}</span>
          </h1>
        </div>

        <div className="grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 md:auto-rows-[minmax(332px,1fr)]">
          <div className="min-h-[332px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-primary-soft)]">
                <CheckSquare className="h-4 w-4 text-[var(--nv-primary)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-primary)]">To-Do</h3>
                  {todoStreak > 0 ? (
                    <div className="flex items-center gap-1 rounded bg-[var(--nv-primary-soft)] px-1.5 py-0.5">
                      <Flame className="h-3 w-3 text-[var(--nv-primary)]" />
                      <span className="text-[0.5rem] font-bold text-[var(--nv-primary)]">{todoStreak}</span>
                    </div>
                  ) : null}
                </div>
                <p className="text-[0.55rem] font-bold uppercase tracking-widest text-[var(--nv-subtle)]">{todayTodosCompleted}/{todayTodos.length} done</p>
              </div>
            </div>
            <div className="space-y-1.5 overflow-y-auto no-scrollbar">
              {todayTodos.length > 0 ? (
                todayTodos.map((todo) => (
                  <div key={todo.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${todo.completed ? 'text-[var(--nv-subtle)] line-through' : 'text-[var(--nv-foreground)]'}`}>
                    <div className={`h-2 w-2 shrink-0 rounded-full ${todo.completed ? 'bg-[var(--nv-primary)]' : 'bg-[var(--nv-border)]'}`} />
                    <span className="truncate">{todo.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--nv-subtle)]">No tasks due today</p>
              )}
            </div>
          </div>

          <div className="min-h-[332px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-danger-soft)]">
                <Flame className="h-4 w-4 text-[var(--nv-danger)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-danger)]">Habits</h3>
                  {habitStreak > 0 ? (
                    <div className="flex items-center gap-1 rounded bg-[var(--nv-danger-soft)] px-1.5 py-0.5">
                      <Flame className="h-3 w-3 text-[var(--nv-danger)]" />
                      <span className="text-[0.5rem] font-bold text-[var(--nv-danger)]">{habitStreak}</span>
                    </div>
                  ) : null}
                </div>
                <p className="text-[0.55rem] font-bold uppercase tracking-widest text-[var(--nv-subtle)]">{todayHabitsCompleted}/{habits.length} done</p>
              </div>
            </div>
            <div className="space-y-1.5 overflow-y-auto no-scrollbar">
              {habits.length > 0 ? (
                habits.map((habit) => {
                  const done = habit.completedDates.includes(todayStr)
                  return (
                    <div key={habit.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${done ? 'text-[var(--nv-subtle)] line-through' : 'text-[var(--nv-foreground)]'}`}>
                      <div className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-[var(--nv-danger)]' : 'bg-[var(--nv-border)]'}`} />
                      <span className="truncate">{habit.title}</span>
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-[var(--nv-subtle)]">No habits created yet</p>
              )}
            </div>
          </div>

          <div className="min-h-[332px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 transition-colors hover:border-[var(--nv-primary)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-secondary-soft)]">
                <StackedCardsIcon className="h-4 w-4 text-[var(--nv-secondary)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--nv-secondary)]">Flashcards</h3>
                  {activeFlashcardDecks > 0 ? (
                    <div className="flex items-center gap-1 rounded bg-[var(--nv-secondary-soft)] px-1.5 py-0.5">
                      <Flame className="h-3 w-3 text-[var(--nv-secondary)]" />
                      <span className="text-[0.5rem] font-bold text-[var(--nv-secondary)]">{activeFlashcardDecks}</span>
                    </div>
                  ) : null}
                </div>
                <p className="text-[0.55rem] font-bold uppercase tracking-widest text-[var(--nv-subtle)]">{totalFlashcardsDue} due / {totalFlashcardsNew} new</p>
              </div>
            </div>
            <div className="space-y-1.5 overflow-y-auto no-scrollbar">
              {flashcardDecks.length > 0 ? (
                flashcardDecks.map((deck) => (
                  <div key={deck.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-[var(--nv-foreground)]">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--nv-secondary)]" />
                      <span className="truncate">{deck.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      {deck.dueToday > 0 ? (
                        <span className="block text-[0.55rem] font-bold uppercase text-[var(--nv-danger)]">{deck.dueToday} due</span>
                      ) : deck.newCards > 0 ? (
                        <span className="block text-[0.55rem] font-bold uppercase text-[var(--nv-secondary)]">{deck.newCards} new</span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--nv-subtle)]">
                  {isFlashcardsLoading ? 'Loading flashcard decks...' : 'No flashcard decks found in your vault'}
                </p>
              )}
            </div>
          </div>

          <DashboardRiskWidget />
        </div>
      </main>

      <aside
        className={`${
          showVaultStats ? 'flex' : 'hidden'
        } h-[calc(100vh-48px)] w-[286px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--nv-border)] bg-[#080606] p-3 no-scrollbar`}
      >
        <section className="shrink-0 overflow-hidden rounded-[12px] border border-[var(--nv-border)] bg-[#090707] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3 p-3">
            <div className="rounded-[10px] border border-white/5 bg-black px-1 pt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex min-h-[120px] flex-col items-center justify-center pb-2 pt-2">
                <div className="origin-bottom max-w-[118px]">
                  <CharacterViewer characterId={selectedCharacter} size="large" showControls showLabel />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {sidebarStatBars.map((stat) => (
                <div key={stat.label} className="rounded-[8px] border border-[var(--nv-border)] bg-[#0d0a0a] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">{stat.label}</span>
                    <span className="text-[10px] font-black" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--nv-bg)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: stat.width, backgroundColor: stat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 px-4 pb-4 pt-2">
            <div className="rounded-[8px] border border-[var(--nv-border)] bg-[#0d0a0a] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-primary)]">
                    LVL
                  </span>
                  <span className="text-sm font-black text-[var(--nv-foreground)]">Level {level}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--nv-subtle)]">{xpIntoCurrentLevel}/{xpNeededForCurrentLevel}</span>
              </div>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[var(--nv-bg)]">
                <div className="h-full rounded-full bg-[var(--nv-primary)]" style={{ width: `${xpPercentage}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[8px] border border-[var(--nv-border)] bg-[#0d0a0a] px-3 py-2.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">SCRAPS</span>
              <div className="flex items-center gap-2">
                <NetheriteScrapIcon size={15} />
                <span className="text-base font-black text-[var(--nv-foreground)]">{scraps || 0}</span>
              </div>
            </div>
          </div>
        </section>

        <StreakCalendarStrip
          currentStreak={streak.count}
          compact
          title="STREAK REWARDS"
          subtitle="Compact milestone calendar"
        />
      </aside>
    </div>
  )
}
