import type { Habit, TodoMomentumContext } from '@/hooks/use-data'
import { formatLocalDate, parseLocalDate } from '@/lib/date'

const HISTORY_WINDOW_DAYS = 30
const CONSISTENCY_WINDOW_DAYS = 14
const SKIP_WINDOW_DAYS = 56
const MIN_COMPLETIONS_FOR_TIME_ANCHOR = 10
const TIME_ANCHOR_RECHECK_INTERVAL = 5
const TIME_ANCHOR_THRESHOLD = 0.8
const TIME_ANCHOR_BREAK_RUN = 14

export type HabitPermanenceTier = 'Forming' | 'Consolidating' | 'Permanent'

type HabitEventAction = 'completed' | 'skipped' | 'unchecked'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function createHabitWithPermanenceDefaults(habit: Habit): Habit {
  return {
    ...habit,
    completion_history_30d: ensureHistory(habit.completion_history_30d),
    current_streak: habit.current_streak ?? 0,
    longest_streak: habit.longest_streak ?? 0,
    time_anchored: habit.time_anchored ?? false,
    skip_days: habit.skip_days ?? [],
    permanence_score: habit.permanence_score ?? 0,
    completionHours: habit.completionHours ?? {},
    skippedDates: habit.skippedDates ?? [],
    anchorWindowStartHour: typeof habit.anchorWindowStartHour === 'number' ? habit.anchorWindowStartHour : null,
    offAnchorCompletionRun: habit.offAnchorCompletionRun ?? 0
  }
}

export function recordHabitEvent(
  habit: Habit,
  options: {
    action: HabitEventAction
    today: string
    now?: Date
  }
) {
  const { action, today, now = new Date() } = options
  const baseHabit = createHabitWithPermanenceDefaults(habit)
  const completedDates = new Set(baseHabit.completedDates)
  const skippedDates = new Set(baseHabit.skippedDates)
  const completionHours = { ...baseHabit.completionHours }

  if (action === 'completed') {
    completedDates.add(today)
    skippedDates.delete(today)
    completionHours[today] = now.getHours()
  }

  if (action === 'skipped') {
    completedDates.delete(today)
    skippedDates.add(today)
    delete completionHours[today]
  }

  if (action === 'unchecked') {
    completedDates.delete(today)
    skippedDates.delete(today)
    delete completionHours[today]
  }

  return recomputeHabitPermanence({
    ...baseHabit,
    completedDates: sortDateStrings([...completedDates]),
    skippedDates: sortDateStrings([...skippedDates]),
    completionHours
  }, {
    today,
    action,
    completionHour: action === 'completed' ? now.getHours() : null
  })
}

export function recomputeHabitPermanence(
  habit: Habit,
  options: {
    today: string
    action?: HabitEventAction
    completionHour?: number | null
  }
): Habit {
  const { today, action, completionHour = null } = options
  const baseHabit = createHabitWithPermanenceDefaults(habit)
  const completion_history_30d = buildCompletionHistory(baseHabit.completedDates, today)
  const streaks = computeStreaks(baseHabit.completedDates)
  const skip_days = computeSkipDays(baseHabit.skippedDates ?? [], baseHabit.createdAt, today)
  const consistency_14d = completion_history_30d.slice(0, CONSISTENCY_WINDOW_DAYS).filter(Boolean).length / CONSISTENCY_WINDOW_DAYS
  const timeAnchorState = updateTimeAnchorState(baseHabit, {
    action,
    completionCount: baseHabit.completedDates.length,
    completionHour
  })
  const current_streak =
    action === 'skipped' || (baseHabit.skippedDates ?? []).includes(today) ? 0 : streaks.current_streak
  const permanence_score = computePermanenceScore({
    consistency14d: consistency_14d,
    currentStreak: current_streak,
    timeAnchored: timeAnchorState.time_anchored,
    skipDaysCount: skip_days.length
  })

  return {
    ...baseHabit,
    completion_history_30d,
    current_streak,
    longest_streak: streaks.longest_streak,
    time_anchored: timeAnchorState.time_anchored,
    skip_days,
    permanence_score,
    anchorWindowStartHour: timeAnchorState.anchorWindowStartHour,
    offAnchorCompletionRun: timeAnchorState.offAnchorCompletionRun
  }
}

export function getHabitPermanenceTier(score: number): HabitPermanenceTier {
  if (score >= 75) return 'Permanent'
  if (score >= 40) return 'Consolidating'
  return 'Forming'
}

export function getHabitPermanenceTierWidth(score: number) {
  const tier = getHabitPermanenceTier(score)
  if (tier === 'Permanent') return '100%'
  if (tier === 'Consolidating') return '66.6667%'
  return '33.3334%'
}

export function getHabitContextMessage(habit: Habit, today: string) {
  const normalizedHabit = createHabitWithPermanenceDefaults(habit)
  const permanenceScore = normalizedHabit.permanence_score ?? 0
  const consistency14d =
    (normalizedHabit.completion_history_30d ?? ensureHistory()).slice(0, CONSISTENCY_WINDOW_DAYS).filter(Boolean).length /
    CONSISTENCY_WINDOW_DAYS

  if (permanenceScore >= 75) {
    return 'This habit is becoming automatic. Consider increasing the challenge.'
  }

  if ((normalizedHabit.current_streak ?? 0) >= 7 && permanenceScore < 75) {
    return `${normalizedHabit.current_streak}-day streak - this habit is consolidating.`
  }

  if (normalizedHabit.time_anchored) {
    return 'Completing this at a consistent time is strengthening the habit loop.'
  }

  if ((normalizedHabit.skip_days?.length ?? 0) > 0) {
    const firstSkipDay = normalizedHabit.skip_days?.[0] ?? 0
    return `You tend to skip this on ${DAY_NAMES[firstSkipDay]}s - want to make it easier then?`
  }

  if (consistency14d < 0.4) {
    return 'Getting started is the hardest part. Even partial counts.'
  }

  return null
}

export function getWeakHabitDayContext(habits: Habit[], today: string): TodoMomentumContext {
  const formingIncompleteCount = habits.filter((habit) => {
    const normalizedHabit = createHabitWithPermanenceDefaults(habit)
    return getHabitPermanenceTier(normalizedHabit.permanence_score ?? 0) === 'Forming' && !normalizedHabit.completedDates.includes(today)
  }).length

  return {
    weak_habit_day: formingIncompleteCount >= 2,
    weak_habit_day_date: today
  }
}

function computePermanenceScore(options: {
  consistency14d: number
  currentStreak: number
  timeAnchored: boolean
  skipDaysCount: number
}) {
  const streakComponent = Math.min(options.currentStreak, 21) / 21
  const timeAnchorBonus = options.timeAnchored ? 15 : 0
  const skipPenalty = options.skipDaysCount > 0 ? 15 : 0

  return Math.max(
    0,
    Math.min(
      100,
      options.consistency14d * 40 + streakComponent * 30 + timeAnchorBonus + (15 - skipPenalty)
    )
  )
}

function updateTimeAnchorState(
  habit: Habit,
  options: {
    action?: HabitEventAction
    completionCount: number
    completionHour?: number | null
  }
) {
  const currentState = {
    time_anchored: habit.time_anchored ?? false,
    anchorWindowStartHour: typeof habit.anchorWindowStartHour === 'number' ? habit.anchorWindowStartHour : null,
    offAnchorCompletionRun: habit.offAnchorCompletionRun ?? 0
  }

  if (options.action !== 'completed' || options.completionHour === null) {
    return currentState
  }

  if (currentState.time_anchored && currentState.anchorWindowStartHour !== null) {
    const inAnchorWindow = isHourInWindow(options.completionHour, currentState.anchorWindowStartHour)
    const nextOffAnchorRun = inAnchorWindow ? 0 : currentState.offAnchorCompletionRun + 1

    if (nextOffAnchorRun >= TIME_ANCHOR_BREAK_RUN) {
      const shiftedWindow = getDominantTwoHourWindow(habit.completionHours ?? {})
      if (shiftedWindow && shiftedWindow.ratio >= TIME_ANCHOR_THRESHOLD) {
        return {
          time_anchored: true,
          anchorWindowStartHour: shiftedWindow.startHour,
          offAnchorCompletionRun: 0
        }
      }

      return {
        time_anchored: false,
        anchorWindowStartHour: null,
        offAnchorCompletionRun: nextOffAnchorRun
      }
    }

    return {
      ...currentState,
      offAnchorCompletionRun: nextOffAnchorRun
    }
  }

  if (
    options.completionCount < MIN_COMPLETIONS_FOR_TIME_ANCHOR ||
    options.completionCount % TIME_ANCHOR_RECHECK_INTERVAL !== 0
  ) {
    return currentState
  }

  const dominantWindow = getDominantTwoHourWindow(habit.completionHours ?? {})
  if (!dominantWindow || dominantWindow.ratio < TIME_ANCHOR_THRESHOLD) {
    return currentState
  }

  return {
    time_anchored: true,
    anchorWindowStartHour: dominantWindow.startHour,
    offAnchorCompletionRun: 0
  }
}

function getDominantTwoHourWindow(completionHours: Record<string, number>) {
  const hours = Object.values(completionHours).filter((hour) => Number.isFinite(hour))
  if (hours.length < MIN_COMPLETIONS_FOR_TIME_ANCHOR) {
    return null
  }

  let bestWindow = {
    startHour: 0,
    ratio: 0
  }

  for (let startHour = 0; startHour < 24; startHour += 1) {
    const count = hours.filter((hour) => isHourInWindow(hour, startHour)).length
    const ratio = count / hours.length
    if (ratio > bestWindow.ratio) {
      bestWindow = {
        startHour,
        ratio
      }
    }
  }

  return bestWindow
}

function isHourInWindow(hour: number, startHour: number) {
  return hour === startHour || hour === (startHour + 1) % 24
}

function buildCompletionHistory(completedDates: string[], today: string) {
  const completedSet = new Set(completedDates)
  const todayDate = parseLocalDate(today)

  return Array.from({ length: HISTORY_WINDOW_DAYS }, (_, index) => {
    const date = new Date(todayDate)
    date.setDate(todayDate.getDate() - index)
    return completedSet.has(formatLocalDate(date))
  })
}

function computeStreaks(completedDates: string[]) {
  const orderedDates = sortDateStrings(completedDates)
  const completedSet = new Set(orderedDates)
  let longest_streak = 0
  let currentRun = 0

  orderedDates.forEach((dateStr) => {
    const previousDate = shiftDateString(dateStr, -1)
    if (!completedSet.has(previousDate)) {
      currentRun = 1
    } else {
      currentRun += 1
    }

    longest_streak = Math.max(longest_streak, currentRun)
  })

  let current_streak = 0
  if (orderedDates.length > 0) {
    let cursor = orderedDates[orderedDates.length - 1]
    while (completedSet.has(cursor)) {
      current_streak += 1
      cursor = shiftDateString(cursor, -1)
    }
  }

  return {
    current_streak,
    longest_streak
  }
}

function computeSkipDays(skippedDates: string[], createdAt: number, today: string) {
  const skippedSet = new Set(skippedDates)
  const startDate = new Date(Math.max(parseLocalDate(today).getTime() - (SKIP_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000, createdAt))
  const endDate = parseLocalDate(today)
  const weekdayTotals = Array.from({ length: 7 }, () => 0)
  const weekdaySkips = Array.from({ length: 7 }, () => 0)

  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    const dateStr = formatLocalDate(cursor)
    const weekdayIndex = getMondayFirstDayIndex(cursor)
    weekdayTotals[weekdayIndex] += 1

    if (skippedSet.has(dateStr)) {
      weekdaySkips[weekdayIndex] += 1
    }
  }

  return weekdayTotals.reduce<number[]>((result, total, weekdayIndex) => {
    if (total > 0 && weekdaySkips[weekdayIndex] / total > 0.6) {
      result.push(weekdayIndex)
    }
    return result
  }, [])
}

function ensureHistory(history?: boolean[]) {
  if (Array.isArray(history) && history.length === HISTORY_WINDOW_DAYS) {
    return [...history]
  }

  return Array.from({ length: HISTORY_WINDOW_DAYS }, () => false)
}

function sortDateStrings(dates: string[]) {
  return [...new Set(dates)].sort((left, right) => parseLocalDate(left).getTime() - parseLocalDate(right).getTime())
}

function shiftDateString(dateStr: string, deltaDays: number) {
  const date = parseLocalDate(dateStr)
  date.setDate(date.getDate() + deltaDays)
  return formatLocalDate(date)
}

function getMondayFirstDayIndex(date: Date) {
  return (date.getDay() + 6) % 7
}
