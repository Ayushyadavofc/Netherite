import { useEffect, useRef, useState } from 'react'

import { PRECHAOS_APP_EVENT, type PreChaosAppEventDetail } from './app-events'
import type { PreChaosRawEvent } from './types'
import { usePreChaosStore } from './store'

const CONTEXT_SNAPSHOT_MS = 2_000
const CONTEXT_ACTIVITY_WINDOW_MS = 60_000
const DATASET_RESUME_DELAY_MS = 2_000
const MOUSE_FLUSH_MS = 250
const SCROLL_THROTTLE_MS = 1_000
const WEBCAM_SIGNAL_MS = 5_000
const ACTIVE_NOTE_PATH_KEY = 'netherite-active-note-path'
const ACTIVE_NOTE_EDITING_KEY = 'netherite-active-note-editing'
const ACTIVE_NOTE_CONTENT_KEY = 'netherite-active-note-content'

type CollectorOptions = {
  enabled?: boolean
}

type StudyContextSnapshot = {
  isStudyContext: boolean
  studyContextEnteredAt: number | null
  datasetWriteResumesAt: number | null
}

const getCurrentRoute = () => window.location.hash.replace(/^#/, '') || '/'

const getPageName = (route: string) => {
  if (route.startsWith('/notes')) return 'notes'
  if (route.startsWith('/flashcards')) return 'flashcards'
  if (route.startsWith('/todos')) return 'todos'
  if (route.startsWith('/habits')) return 'habits'
  if (route.startsWith('/analytics')) return 'analytics'
  if (route === '/') return 'landing'
  return 'other'
}

const getFocusedEditable = () => {
  const activeElement = document.activeElement as HTMLElement | null
  return Boolean(
    activeElement &&
      (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable ||
        activeElement.getAttribute('role') === 'textbox')
  )
}

const hasOpenEditableNote = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const activeNotePath = window.localStorage.getItem(ACTIVE_NOTE_PATH_KEY)
  const activeNoteEditing = window.localStorage.getItem(ACTIVE_NOTE_EDITING_KEY)
  const activeNoteContent = window.localStorage.getItem(ACTIVE_NOTE_CONTENT_KEY)
  return Boolean(activeNotePath?.trim() && activeNoteEditing !== null && activeNoteContent !== null)
}

const getKeyClass = (event: KeyboardEvent): NonNullable<PreChaosRawEvent['key_class']> => {
  if (event.key === 'Backspace') return 'backspace'
  if (event.key === 'Delete') return 'delete'
  if (event.key === 'Enter') return 'enter'
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return 'character'
  if (
    event.key.startsWith('Arrow') ||
    event.key === 'Home' ||
    event.key === 'End' ||
    event.key === 'PageUp' ||
    event.key === 'PageDown'
  ) {
    return 'navigation'
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return 'modifier'
  }
  return 'other'
}

export function useBehaviorCollector(options: CollectorOptions = {}): StudyContextSnapshot {
  const enabled = options.enabled ?? true
  const pushBehavior = usePreChaosStore((state) => state.pushBehavior)
  const setAppContext = usePreChaosStore((state) => state.setAppContext)
  const setStudyContextActive = usePreChaosStore((state) => state.setStudyContextActive)
  const logEvent = usePreChaosStore((state) => state.logEvent)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const fatigueScore = usePreChaosStore((state) => state.fatigueScore)

  const [isStudyContext, setIsStudyContext] = useState(false)
  const [studyContextEnteredAt, setStudyContextEnteredAt] = useState<number | null>(null)
  const [datasetWriteResumesAt, setDatasetWriteResumesAt] = useState<number | null>(null)

  const lastActivityRef = useRef(Date.now())
  const lastMeaningfulActionRef = useRef(Date.now())
  const routeSwitchCountRef = useRef(0)
  const routeEnteredAtRef = useRef(Date.now())
  const currentRouteRef = useRef(getCurrentRoute())
  const noteActivityTimestampsRef = useRef<number[]>([])
  const noteSwitchTimestampsRef = useRef<number[]>([])
  const noteSaveTimestampsRef = useRef<number[]>([])
  const flashcardActivityTimestampsRef = useRef<number[]>([])
  const flashcardLatencySamplesRef = useRef<number[]>([])
  const flashcardSuccessTimestampsRef = useRef<number[]>([])
  const progressEventTimestampsRef = useRef<number[]>([])
  const todoActivityTimestampsRef = useRef<number[]>([])
  const todoCompletionTimestampsRef = useRef<number[]>([])
  const habitActivityTimestampsRef = useRef<number[]>([])
  const habitCheckInTimestampsRef = useRef<number[]>([])
  const idleLoggedRef = useRef(false)
  const lastTypingEventLoggedRef = useRef(0)
  const fatigueScoreRef = useRef(fatigueScore)
  const webcamOptInRef = useRef(webcamOptIn)
  const flashcardReviewActiveRef = useRef(false)
  const isStudyContextRef = useRef(false)
  const datasetWriteResumesAtRef = useRef<number | null>(null)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)
  const pendingMouseDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const mouseFlushTimerRef = useRef<number | null>(null)
  const lastScrollEventRef = useRef(0)
  const lastWebcamSignalRef = useRef(0)
  const keystrokeTimestampsRef = useRef<number[]>([])
  const backspaceCountRef = useRef(0)

  useEffect(() => {
    fatigueScoreRef.current = fatigueScore
  }, [fatigueScore])

  useEffect(() => {
    webcamOptInRef.current = webcamOptIn
  }, [webcamOptIn])

  useEffect(() => {
    if (!enabled) {
      setStudyContextActive(false)
      setIsStudyContext(false)
      setStudyContextEnteredAt(null)
      setDatasetWriteResumesAt(null)
      return
    }

    const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
    const pruneRecent = (timestamps: number[], windowMs = CONTEXT_ACTIVITY_WINDOW_MS) =>
      timestamps.filter((stamp) => Date.now() - stamp <= windowMs)

    const computeStudyContext = (route: string) => {
      if (route.startsWith('/notes')) {
        return hasOpenEditableNote()
      }
      if (route.startsWith('/flashcards')) {
        return flashcardReviewActiveRef.current
      }
      return false
    }

    const syncStudyContext = (route = getCurrentRoute()) => {
      const nextStudyContext = computeStudyContext(route)
      if (nextStudyContext === isStudyContextRef.current) {
        return nextStudyContext
      }

      const now = Date.now()
      isStudyContextRef.current = nextStudyContext
      setStudyContextActive(nextStudyContext)
      setIsStudyContext(nextStudyContext)

      if (nextStudyContext) {
        setStudyContextEnteredAt(now)
        datasetWriteResumesAtRef.current = now + DATASET_RESUME_DELAY_MS
        setDatasetWriteResumesAt(datasetWriteResumesAtRef.current)
        lastActivityRef.current = now
        lastMeaningfulActionRef.current = now
      } else {
        setStudyContextEnteredAt(null)
        datasetWriteResumesAtRef.current = null
        setDatasetWriteResumesAt(null)
      }

      return nextStudyContext
    }

    const shouldWriteToDataset = (timestamp: number) =>
      isStudyContextRef.current &&
      datasetWriteResumesAtRef.current !== null &&
      timestamp >= datasetWriteResumesAtRef.current

    const emitRawEvent = (event: Omit<PreChaosRawEvent, 'timestamp'>, timestamp = Date.now()) => {
      pushBehavior(
        {
          timestamp,
          ...event
        },
        timestamp,
        {
          isStudyContext: isStudyContextRef.current,
          writeToDataset: shouldWriteToDataset(timestamp)
        }
      )
    }

    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }

    const markMeaningfulAction = () => {
      const route = getCurrentRoute()
      const now = Date.now()
      const secondsSinceLastMeaningful = (now - lastMeaningfulActionRef.current) / 1000

      if (route.startsWith('/notes')) {
        noteActivityTimestampsRef.current = pruneRecent([...noteActivityTimestampsRef.current, now])
      } else if (route.startsWith('/flashcards')) {
        flashcardActivityTimestampsRef.current = pruneRecent([...flashcardActivityTimestampsRef.current, now])
        if (secondsSinceLastMeaningful >= 1.2) {
          flashcardLatencySamplesRef.current.push(Math.min(secondsSinceLastMeaningful, 18))
          flashcardLatencySamplesRef.current = flashcardLatencySamplesRef.current.slice(-10)
        }
      } else if (route.startsWith('/todos')) {
        todoActivityTimestampsRef.current = pruneRecent([...todoActivityTimestampsRef.current, now])
      } else if (route.startsWith('/habits')) {
        habitActivityTimestampsRef.current = pruneRecent([...habitActivityTimestampsRef.current, now])
      }

      lastMeaningfulActionRef.current = now
      markActivity()
    }

    const flushMouseMovement = () => {
      mouseFlushTimerRef.current = null
      const pending = pendingMouseDeltaRef.current
      if (pending.dx === 0 && pending.dy === 0) {
        return
      }

      emitRawEvent({
        type: 'mouse_move',
        dx: Number(pending.dx.toFixed(2)),
        dy: Number(pending.dy.toFixed(2))
      })
      pendingMouseDeltaRef.current = { dx: 0, dy: 0 }
    }

    const scheduleMouseFlush = () => {
      if (mouseFlushTimerRef.current !== null) {
        return
      }
      mouseFlushTimerRef.current = window.setTimeout(flushMouseMovement, MOUSE_FLUSH_MS)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      syncStudyContext()

      const now = Date.now()
      emitRawEvent({
        type: 'key_down',
        key_class: getKeyClass(event)
      }, now)

      keystrokeTimestampsRef.current = pruneRecent([...keystrokeTimestampsRef.current, now])
      if (event.key === 'Backspace') {
        backspaceCountRef.current += 1
      }

      if (now - lastTypingEventLoggedRef.current > 3_000) {
        lastTypingEventLoggedRef.current = now
        logEvent({
          type: 'typing',
          label: `Typing in ${getCurrentRoute().replace('/', '') || 'landing'}`,
          route: getCurrentRoute(),
          importance: 'medium'
        })
      }

      markMeaningfulAction()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (lastMouseRef.current) {
        pendingMouseDeltaRef.current.dx += event.clientX - lastMouseRef.current.x
        pendingMouseDeltaRef.current.dy += event.clientY - lastMouseRef.current.y
        scheduleMouseFlush()
      }
      lastMouseRef.current = { x: event.clientX, y: event.clientY }
      markActivity()
    }

    const onVisibility = () => {
      syncStudyContext()

      const hidden = document.hidden
      emitRawEvent({
        type: 'visibility_change',
        hidden
      })

      const webcamState = usePreChaosStore.getState().webcamState
      if (hidden && webcamState !== 'requesting') {
        logEvent({
          type: 'route',
          label: 'App hidden or tab switched',
          route: getCurrentRoute(),
          importance: 'high'
        })
      }
      markActivity()
    }

    const onMouseDown = (event: MouseEvent) => {
      const route = getCurrentRoute()
      const target = event.target as HTMLElement | null
      const targetText = normalizeText(
        target?.getAttribute('aria-label') || target?.textContent || target?.getAttribute('data-state') || ''
      )

      syncStudyContext(route)

      if (
        route.startsWith('/flashcards') &&
        (target?.closest('button, [role="button"]') || /(again|hard|good|easy|show answer)/.test(targetText))
      ) {
        markMeaningfulAction()
        return
      }

      if (
        route.startsWith('/notes') &&
        (target?.closest('button, a, [role="button"], [data-prechaos-meaningful="true"]') ||
          target?.closest('input, textarea, [contenteditable="true"]'))
      ) {
        markMeaningfulAction()
        return
      }

      markActivity()
    }

    const onScroll = () => {
      const now = Date.now()
      if (now - lastScrollEventRef.current >= SCROLL_THROTTLE_MS) {
        lastScrollEventRef.current = now
        emitRawEvent({
          type: 'scroll'
        }, now)
      }
      markMeaningfulAction()
    }

    const onFocusIn = () => {
      const route = getCurrentRoute()
      syncStudyContext(route)

      emitRawEvent({
        type: 'focus',
        route
      })

      logEvent({
        type: 'focus',
        label: `Focused ${route.replace('/', '') || 'landing'} workspace`,
        route,
        importance: 'low'
      })
      markMeaningfulAction()
    }

    const onHashChange = () => {
      const previousRoute = currentRouteRef.current
      const route = getCurrentRoute()
      const now = Date.now()

      if (previousRoute !== route) {
        routeSwitchCountRef.current += 1
        emitRawEvent({
          type: 'route_change',
          route
        }, now)
      }
      if (previousRoute.startsWith('/notes') && route.startsWith('/notes') && previousRoute !== route) {
        noteSwitchTimestampsRef.current = pruneRecent([...noteSwitchTimestampsRef.current, now])
      }

      currentRouteRef.current = route
      routeEnteredAtRef.current = now
      syncStudyContext(route)
    }

    const onAppEvent = (event: Event) => {
      const detail = (event as CustomEvent<PreChaosAppEventDetail>).detail
      if (!detail) {
        return
      }

      const route = getCurrentRoute()
      const now = Date.now()

      if (detail.source === 'flashcards') {
        if (detail.action === 'flashcard_session_started') {
          flashcardReviewActiveRef.current = true
        } else if (detail.action === 'flashcard_session_ended' || detail.action === 'flashcard_deck_opened') {
          flashcardReviewActiveRef.current = false
        }
      }

      syncStudyContext(route)

      if (detail.source === 'notes') {
        noteActivityTimestampsRef.current = pruneRecent([...noteActivityTimestampsRef.current, now])
        if (detail.action === 'note_saved') {
          noteSaveTimestampsRef.current = pruneRecent([...noteSaveTimestampsRef.current, now])
          progressEventTimestampsRef.current = pruneRecent([...progressEventTimestampsRef.current, now])
        }
        if (detail.action === 'note_created' || detail.action === 'folder_created') {
          progressEventTimestampsRef.current = pruneRecent([...progressEventTimestampsRef.current, now])
        }
      }

      if (detail.source === 'flashcards') {
        flashcardActivityTimestampsRef.current = pruneRecent([...flashcardActivityTimestampsRef.current, now])
        if (detail.action === 'flashcard_success') {
          flashcardSuccessTimestampsRef.current = pruneRecent([...flashcardSuccessTimestampsRef.current, now])
          progressEventTimestampsRef.current = pruneRecent([...progressEventTimestampsRef.current, now])
        }
      }

      if (detail.source === 'todos') {
        todoActivityTimestampsRef.current = pruneRecent([...todoActivityTimestampsRef.current, now])
        if (detail.action === 'todo_completed') {
          todoCompletionTimestampsRef.current = pruneRecent([...todoCompletionTimestampsRef.current, now])
        }
      }

      if (detail.source === 'habits') {
        habitActivityTimestampsRef.current = pruneRecent([...habitActivityTimestampsRef.current, now])
        if (detail.action === 'habit_checked') {
          habitCheckInTimestampsRef.current = pruneRecent([...habitCheckInTimestampsRef.current, now])
        }
      }

      emitRawEvent({
        type: 'study_action',
        route,
        action: detail.action
      }, now)

      if (!(detail.source === 'notes' && detail.action === 'note_keystroke')) {
        logEvent({
          type:
            detail.source === 'notes'
              ? 'notes'
              : detail.source === 'flashcards'
                ? 'flashcard'
                : detail.source === 'todos'
                  ? 'todo'
                  : 'habit',
          label: detail.label,
          route,
          importance: detail.importance ?? 'medium'
        })
      }

      markMeaningfulAction()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener(PRECHAOS_APP_EVENT, onAppEvent as EventListener)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('visibilitychange', onVisibility)

    syncStudyContext(currentRouteRef.current)
    emitRawEvent({
      type: 'route_change',
      route: currentRouteRef.current
    }, Date.now())

    const interval = window.setInterval(() => {
      const now = Date.now()
      const currentRoute = getCurrentRoute()
      currentRouteRef.current = currentRoute

      const focusedEditable = getFocusedEditable()
      const currentStudyContext = syncStudyContext(currentRoute)
      const pageName = getPageName(currentRoute)
      const routeDwellSeconds = (now - routeEnteredAtRef.current) / 1000
      const secondsSinceLastActivity = (now - lastActivityRef.current) / 1000
      const secondsSinceMeaningfulAction = (now - lastMeaningfulActionRef.current) / 1000

      if (currentStudyContext && secondsSinceLastActivity >= 20 && !idleLoggedRef.current) {
        logEvent({
          type: 'idle',
          label: 'Extended idle window detected',
          route: currentRoute,
          importance: 'high'
        })
        idleLoggedRef.current = true
      }
      if (secondsSinceLastActivity < 8) {
        idleLoggedRef.current = false
      }

      const noteActivity = pruneRecent(noteActivityTimestampsRef.current).length
      noteActivityTimestampsRef.current = pruneRecent(noteActivityTimestampsRef.current)
      const noteSwitches = pruneRecent(noteSwitchTimestampsRef.current).length
      noteSwitchTimestampsRef.current = pruneRecent(noteSwitchTimestampsRef.current)
      const noteSaves = pruneRecent(noteSaveTimestampsRef.current).length
      noteSaveTimestampsRef.current = pruneRecent(noteSaveTimestampsRef.current)
      const flashcardActivity = pruneRecent(flashcardActivityTimestampsRef.current).length
      flashcardActivityTimestampsRef.current = pruneRecent(flashcardActivityTimestampsRef.current)
      const flashcardSuccesses = pruneRecent(flashcardSuccessTimestampsRef.current).length
      flashcardSuccessTimestampsRef.current = pruneRecent(flashcardSuccessTimestampsRef.current)
      const progressEvents = pruneRecent(progressEventTimestampsRef.current).length
      progressEventTimestampsRef.current = pruneRecent(progressEventTimestampsRef.current)
      const todoActivity = pruneRecent(todoActivityTimestampsRef.current).length
      todoActivityTimestampsRef.current = pruneRecent(todoActivityTimestampsRef.current)
      const todoCompletions = pruneRecent(todoCompletionTimestampsRef.current).length
      todoCompletionTimestampsRef.current = pruneRecent(todoCompletionTimestampsRef.current)
      const habitActivity = pruneRecent(habitActivityTimestampsRef.current).length
      habitActivityTimestampsRef.current = pruneRecent(habitActivityTimestampsRef.current)
      const habitCheckIns = pruneRecent(habitCheckInTimestampsRef.current).length
      habitCheckInTimestampsRef.current = pruneRecent(habitCheckInTimestampsRef.current)
      const flashcardAnswerLatency = flashcardLatencySamplesRef.current.length
        ? flashcardLatencySamplesRef.current.reduce((sum, value) => sum + value, 0) /
          flashcardLatencySamplesRef.current.length
        : 0

      if (webcamOptInRef.current && now - lastWebcamSignalRef.current >= WEBCAM_SIGNAL_MS) {
        lastWebcamSignalRef.current = now
        emitRawEvent({
          type: 'webcam_signal',
          fatigue_score: Number(fatigueScoreRef.current.toFixed(4)),
          confidence: 1
        }, now)
      }

      const recentKeystrokes = keystrokeTimestampsRef.current.filter(
        (ts) => now - ts <= 12_000
      )
      keystrokeTimestampsRef.current = recentKeystrokes
      const typingSpeed = recentKeystrokes.length / 12
      let pauseTime = 0
      let typingVariation = 0
      if (recentKeystrokes.length >= 2) {
        const sorted = [...recentKeystrokes].sort((a, b) => a - b)
        const intervals: number[] = []
        for (let i = 1; i < sorted.length; i++) {
          intervals.push((sorted[i] - sorted[i - 1]) / 1000)
        }
        pauseTime = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
        const mean = pauseTime
        const variance =
          intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length
        typingVariation = Math.sqrt(variance)
      }
      const backspaceCount = backspaceCountRef.current
      backspaceCountRef.current = 0

      setAppContext({
        route: currentRoute,
        page_name: pageName,
        productive_context: currentStudyContext,
        focused_editable: focusedEditable,
        recent_meaningful_actions: Math.max(0, Math.round((30 - Math.min(secondsSinceMeaningfulAction, 30)) / 3)),
        recent_event_density: Number(
          Math.min(
            noteActivity +
              flashcardActivity +
              todoActivity +
              habitActivity +
              progressEvents +
              (secondsSinceLastActivity < 4 ? 1 : 0),
            10
          ).toFixed(4)
        ),
        route_switches: routeSwitchCountRef.current,
        route_dwell_seconds: Number(routeDwellSeconds.toFixed(4)),
        note_activity: noteActivity,
        note_switches: noteSwitches,
        note_saves: noteSaves,
        typing_speed: typingSpeed,
        pause_time: pauseTime,
        typing_variation: typingVariation,
        backspace_count: backspaceCount,
        flashcard_activity: flashcardActivity,
        flashcard_answer_latency: Number(flashcardAnswerLatency.toFixed(4)),
        flashcard_successes: flashcardSuccesses,
        todo_activity: todoActivity,
        todo_completions: todoCompletions,
        habit_activity: habitActivity,
        habit_check_ins: habitCheckIns,
        progress_events: progressEvents,
        reading_mode: !focusedEditable && secondsSinceLastActivity < 12,
        webcam_opt_in: webcamOptInRef.current,
        last_activity_timestamp: lastActivityRef.current
      })

      routeSwitchCountRef.current = 0
    }, CONTEXT_SNAPSHOT_MS)

    return () => {
      if (mouseFlushTimerRef.current !== null) {
        window.clearTimeout(mouseFlushTimerRef.current)
      }
      flushMouseMovement()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener(PRECHAOS_APP_EVENT, onAppEvent as EventListener)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
      setStudyContextActive(false)
    }
  }, [enabled, logEvent, pushBehavior, setAppContext, setStudyContextActive])

  return { isStudyContext, studyContextEnteredAt, datasetWriteResumesAt }
}
