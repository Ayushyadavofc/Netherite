import type {
  Todo,
  TodoDifficultyTag,
  TodoMomentumBucket,
  TodoMomentumContext,
  TodoMomentumOutcome,
  TodoMomentumState
} from '@/hooks/use-data'

const MOMENTUM_DECAY_THRESHOLD_MS = 90 * 60 * 1000
const MOMENTUM_DECAY_STEP_MS = 30 * 60 * 1000
const MOMENTUM_RESET_THRESHOLD_MS = 8 * 60 * 60 * 1000

export type MomentumBand = 'low' | 'building' | 'strong'
export type TodoSuggestionLabel = 'suggested now' | 'save for later' | 'scheduled' | null

export interface RankedTodo {
  todo: Todo
  difficultyTag: TodoDifficultyTag
  label: TodoSuggestionLabel
  note: string | null
  showReorderHint: boolean
}

export interface TodoReorderResult {
  orderedTodos: RankedTodo[]
  band: MomentumBand
  didReorder: boolean
  suggestedTaskId: string | null
}

const HOURLY_BUCKETS: TodoMomentumBucket[] = ['morning', 'afternoon', 'evening', 'night']

const LOW_DIFFICULTY_ORDER: Record<TodoDifficultyTag, number> = {
  easy: 0,
  medium: 1,
  hard: 2
}

const STRONG_SUGGESTION_NOTE = "You're on a roll - good time for this."
const LOW_SUGGESTION_NOTE = 'Starting here builds momentum for harder tasks.'
const SAVE_FOR_LATER_NOTE = 'Save for a stronger moment.'

const cloneHourlyRecord = (source: Record<TodoMomentumBucket, number>) => ({
  morning: source.morning,
  afternoon: source.afternoon,
  evening: source.evening,
  night: source.night
})

export function touchTodoMomentum(state: TodoMomentumState, now = new Date()) {
  const timestamp = now.toISOString()
  if (state.last_activity_at === timestamp && state.last_idle_penalty_at === timestamp) {
    return state
  }

  return {
    ...state,
    last_activity_at: timestamp,
    last_idle_penalty_at: timestamp
  }
}

export function getMomentumBand(score: number): MomentumBand {
  if (score < 40) return 'low'
  if (score <= 70) return 'building'
  return 'strong'
}

export function getTodoDifficultyTag(todo: Todo): TodoDifficultyTag {
  if (todo.manualDifficultyTag) {
    return todo.manualDifficultyTag
  }

  if (typeof todo.estimatedMinutes === 'number' && Number.isFinite(todo.estimatedMinutes)) {
    if (todo.estimatedMinutes < 15) return 'easy'
    if (todo.estimatedMinutes <= 45) return 'medium'
    return 'hard'
  }

  if (todo.difficulty >= 4) return 'hard'
  if (todo.difficulty >= 2) return 'medium'
  return 'easy'
}

export function getMomentumBarLabel(score: number) {
  const band = getMomentumBand(score)

  switch (band) {
    case 'low':
      return 'Low'
    case 'strong':
      return 'Strong'
    case 'building':
    default:
      return 'Building'
  }
}

export function getScheduledTaskMessage(scheduledTime: string) {
  return `Scheduled for ${formatScheduledTime(scheduledTime)} - want something lighter first?`
}

export function formatScheduledTime(time: string) {
  const [hourString, minuteString = '00'] = time.split(':')
  const hour = Number.parseInt(hourString, 10)
  const minute = Number.parseInt(minuteString, 10)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return time
  }

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: minute === 0 ? undefined : '2-digit'
  }).format(date)
}

export function applyIdleMomentumDecay(
  state: TodoMomentumState,
  options: { hasIncompleteTasks: boolean; now?: Date }
) {
  const { hasIncompleteTasks, now = new Date() } = options

  if (!hasIncompleteTasks || !state.last_activity_at) {
    return state
  }

  const lastActivityAt = Date.parse(state.last_activity_at)
  if (Number.isNaN(lastActivityAt)) {
    return state
  }

  const lastPenaltyAt = state.last_idle_penalty_at ? Date.parse(state.last_idle_penalty_at) : lastActivityAt
  const safeLastPenaltyAt = Number.isNaN(lastPenaltyAt) ? lastActivityAt : lastPenaltyAt
  const elapsedSinceActivity = now.getTime() - lastActivityAt

  if (elapsedSinceActivity >= MOMENTUM_RESET_THRESHOLD_MS) {
    if (safeLastPenaltyAt - lastActivityAt >= MOMENTUM_RESET_THRESHOLD_MS) {
      return state
    }

    return {
      ...state,
      momentum_score: Math.min(100, Math.max(state.momentum_score * 0.5, 20)),
      last_idle_penalty_at: now.toISOString()
    }
  }

  if (elapsedSinceActivity <= MOMENTUM_DECAY_THRESHOLD_MS) {
    return state
  }

  const decayStart = lastActivityAt + MOMENTUM_DECAY_THRESHOLD_MS
  const effectiveStart = Math.max(decayStart, safeLastPenaltyAt)
  const elapsedSinceDecayStart = now.getTime() - effectiveStart
  const penaltySteps = Math.floor(elapsedSinceDecayStart / MOMENTUM_DECAY_STEP_MS)

  if (penaltySteps <= 0) {
    return state
  }

  return {
    ...state,
    momentum_score: Math.max(0, state.momentum_score - penaltySteps * 6),
    last_idle_penalty_at: new Date(effectiveStart + penaltySteps * MOMENTUM_DECAY_STEP_MS).toISOString()
  }
}

export function recordTodoOutcome(
  state: TodoMomentumState,
  outcome: TodoMomentumOutcome,
  now = new Date()
) {
  const bucket = getHourlyBucket(now)
  const hourly_completion_attempts = cloneHourlyRecord(state.hourly_completion_attempts)
  const hourly_completion_completions = cloneHourlyRecord(state.hourly_completion_completions)
  const hourly_completion_rate = cloneHourlyRecord(state.hourly_completion_rate)

  hourly_completion_attempts[bucket] += 1
  if (outcome === 'completed') {
    hourly_completion_completions[bucket] += 1
  }

  HOURLY_BUCKETS.forEach((entry) => {
    const attempts = hourly_completion_attempts[entry]
    hourly_completion_rate[entry] = attempts > 0 ? hourly_completion_completions[entry] / attempts : 0
  })

  const recent_outcomes = [...state.recent_outcomes, outcome].slice(-2)
  const nextScore =
    outcome === 'completed'
      ? Math.min(100, state.momentum_score + 12)
      : Math.max(0, state.momentum_score - 18)

  return {
    ...state,
    momentum_score: nextScore,
    streak_count: outcome === 'completed' ? state.streak_count + 1 : 0,
    recent_failure_flag:
      outcome === 'completed'
        ? false
        : recent_outcomes.length === 2 && recent_outcomes.every((entry) => entry === 'skipped'),
    last_completed_at: outcome === 'completed' ? now.toISOString() : state.last_completed_at,
    hourly_completion_rate,
    hourly_completion_attempts,
    hourly_completion_completions,
    recent_outcomes,
    last_activity_at: now.toISOString(),
    last_idle_penalty_at: now.toISOString()
  }
}

export function getTodoReorderResult(
  todos: Todo[],
  momentum: TodoMomentumState,
  context?: TodoMomentumContext
): TodoReorderResult {
  const pending = todos.filter((todo) => !todo.completed)
  const completed = todos.filter((todo) => todo.completed)
  const effectiveBand = getEffectiveMomentumBand(momentum, context)

  const pendingWithMeta = pending.map((todo, index) => ({
    todo,
    index,
    difficultyTag: getTodoDifficultyTag(todo),
    timed: Boolean(todo.scheduledTime)
  }))

  const reorderedPending =
    effectiveBand === 'low'
      ? reorderForLowMomentum(pendingWithMeta)
      : effectiveBand === 'strong' && momentum.streak_count >= 2
        ? reorderForStrongMomentum(pendingWithMeta)
        : pendingWithMeta

  const baseIds = pendingWithMeta.map((entry) => entry.todo.id)
  const orderedIds = reorderedPending.map((entry) => entry.todo.id)
  const didReorder = baseIds.join('|') !== orderedIds.join('|')
  const suggestedTaskId = getSuggestedTaskId(reorderedPending, effectiveBand, didReorder)

  const orderedTodos = [...reorderedPending, ...completed.map((todo) => ({
    todo,
    difficultyTag: getTodoDifficultyTag(todo),
    index: Number.MAX_SAFE_INTEGER,
    timed: Boolean(todo.scheduledTime)
  }))].map((entry) => {
    const isSuggested = entry.todo.id === suggestedTaskId
    const isTimed = Boolean(entry.todo.scheduledTime) && !entry.todo.completed
    const isSaveForLater =
      effectiveBand === 'low' && !entry.todo.completed && !isTimed && entry.difficultyTag === 'hard'

    return {
      todo: entry.todo,
      difficultyTag: entry.difficultyTag,
      label: isTimed ? 'scheduled' : isSuggested ? 'suggested now' : isSaveForLater ? 'save for later' : null,
      note: isTimed
        ? getScheduledTaskMessage(entry.todo.scheduledTime!)
        : isSuggested
          ? effectiveBand === 'strong'
            ? STRONG_SUGGESTION_NOTE
            : LOW_SUGGESTION_NOTE
          : isSaveForLater
            ? SAVE_FOR_LATER_NOTE
            : null,
      showReorderHint: didReorder && isSuggested
    }
  })

  return {
    orderedTodos,
    band: effectiveBand,
    didReorder,
    suggestedTaskId
  }
}

function getEffectiveMomentumBand(momentum: TodoMomentumState, context?: TodoMomentumContext) {
  if (context?.weak_habit_day && momentum.momentum_score < 60) {
    return 'low'
  }

  if (momentum.recent_failure_flag) {
    return 'low'
  }

  return getMomentumBand(momentum.momentum_score)
}

function reorderForLowMomentum<T extends { index: number; difficultyTag: TodoDifficultyTag; timed: boolean }>(
  items: T[]
) {
  const movable = items
    .filter((item) => !item.timed)
    .sort(
      (left, right) =>
        LOW_DIFFICULTY_ORDER[left.difficultyTag] - LOW_DIFFICULTY_ORDER[right.difficultyTag] || left.index - right.index
    )

  return mergeTimedTasks(items, movable)
}

function reorderForStrongMomentum<T extends { index: number; difficultyTag: TodoDifficultyTag; timed: boolean }>(
  items: T[]
) {
  const movable = items.filter((item) => !item.timed)
  const hardIndex = movable.findIndex((item) => item.difficultyTag === 'hard')
  const launchIndex = movable.findIndex((item) => item.difficultyTag !== 'hard')

  if (hardIndex <= 0 || launchIndex === -1) {
    return items
  }

  const hardTask = movable[hardIndex]
  const nextMovable = movable.filter((_, index) => index !== hardIndex)
  nextMovable.splice(Math.min(launchIndex + 1, nextMovable.length), 0, hardTask)

  return mergeTimedTasks(items, nextMovable)
}

function mergeTimedTasks<T extends { timed: boolean }>(base: T[], movable: T[]) {
  const nextMovable = [...movable]

  return base.map((item) => {
    if (item.timed) {
      return item
    }

    return nextMovable.shift() ?? item
  })
}

function getSuggestedTaskId<T extends { todo: Todo; timed: boolean }>(
  items: T[],
  band: MomentumBand,
  didReorder: boolean
) {
  if (!didReorder) {
    return null
  }

  if (band === 'strong') {
    return items.find((item) => !item.timed && getTodoDifficultyTag(item.todo) === 'hard')?.todo.id ?? null
  }

  return items.find((item) => !item.timed)?.todo.id ?? null
}

function getHourlyBucket(date: Date): TodoMomentumBucket {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}
