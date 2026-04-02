import { useEffect, useRef, useState } from 'react'

import { PRECHAOS_APP_EVENT, type PreChaosAppEventDetail } from './app-events'
import { usePreChaosStore } from './store'

const MOVEMENT_SAMPLE_MS = 2_000
const KEY_WINDOW_MS = 12_000
const CONTEXT_ACTIVITY_WINDOW_MS = 60_000
const FATIGUE_RESUME_DELAY_MS = 2_000

type CollectorOptions = {
  enabled?: boolean
}

type StudyContextSnapshot = {
  isStudyContext: boolean
  studyContextEnteredAt: number | null
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

const isStudyRoute = (route: string) => route.startsWith('/notes') || route.startsWith('/flashcards')

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

  const keypressesRef = useRef<number[]>([])
  const pausesRef = useRef<number[]>([])
  const backspaceCountRef = useRef(0)
  const idleMsRef = useRef(0)
  const tabSwitchCountRef = useRef(0)
  const mouseDistanceRef = useRef(0)
  const lastKeyRef = useRef<number | null>(null)
  const lastActivityRef = useRef(Date.now())
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)
  const lastEmittedFeaturesRef = useRef<number[] | null>(null)
  const lastMeaningfulActionRef = useRef(Date.now())
  const meaningfulActionTimestampsRef = useRef<number[]>([])
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
  const idleLoggedRef = useRef(false)
  const lastTypingEventLoggedRef = useRef(0)
  const fatigueScoreRef = useRef(fatigueScore)
  const webcamOptInRef = useRef(webcamOptIn)
  const flashcardReviewActiveRef = useRef(false)
  const isStudyContextRef = useRef(false)
  const studyContextEnteredAtRef = useRef<number | null>(null)
  const studyAccumulatedMsRef = useRef(0)
  const studyStartedAtRef = useRef<number | null>(null)
  const lastStudyFatigueScoreRef = useRef(fatigueScore)
  const fatigueHoldUntilRef = useRef(0)
  const fatigueHoldValueRef = useRef(fatigueScore)

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
      return
    }

    const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
    const pruneRecent = (timestamps: number[], windowMs = CONTEXT_ACTIVITY_WINDOW_MS) =>
      timestamps.filter((stamp) => Date.now() - stamp <= windowMs)

    const resetSamplingWindow = () => {
      keypressesRef.current = []
      pausesRef.current = []
      backspaceCountRef.current = 0
      idleMsRef.current = 0
      tabSwitchCountRef.current = 0
      mouseDistanceRef.current = 0
      lastKeyRef.current = null
      lastMouseRef.current = null
      lastEmittedFeaturesRef.current = null
      meaningfulActionTimestampsRef.current = []
      lastMeaningfulActionRef.current = Date.now()
      idleLoggedRef.current = false
      lastTypingEventLoggedRef.current = 0
    }

    const computeStudyContext = (route: string, focusedEditable: boolean) => {
      if (route.startsWith('/notes')) {
        return focusedEditable
      }
      if (route.startsWith('/flashcards')) {
        return flashcardReviewActiveRef.current
      }
      return false
    }

    const syncStudyContext = (route = getCurrentRoute(), focusedEditable = getFocusedEditable()) => {
      const nextStudyContext = computeStudyContext(route, focusedEditable)
      const previousStudyContext = isStudyContextRef.current

      if (nextStudyContext === previousStudyContext) {
        return nextStudyContext
      }

      const now = Date.now()
      isStudyContextRef.current = nextStudyContext
      setStudyContextActive(nextStudyContext)
      setIsStudyContext(nextStudyContext)

      if (nextStudyContext) {
        studyStartedAtRef.current = now
        studyContextEnteredAtRef.current = now
        setStudyContextEnteredAt(now)
        fatigueHoldUntilRef.current = now + FATIGUE_RESUME_DELAY_MS
        fatigueHoldValueRef.current = lastStudyFatigueScoreRef.current
        lastActivityRef.current = now
        lastMeaningfulActionRef.current = now
      } else {
        if (studyStartedAtRef.current !== null) {
          studyAccumulatedMsRef.current += now - studyStartedAtRef.current
        }
        studyStartedAtRef.current = null
        studyContextEnteredAtRef.current = null
        setStudyContextEnteredAt(null)
        resetSamplingWindow()
      }

      return nextStudyContext
    }

    const getStudySessionDurationMinutes = (now: number) => {
      const liveStudyMs =
        studyStartedAtRef.current !== null && isStudyContextRef.current ? now - studyStartedAtRef.current : 0
      return (studyAccumulatedMsRef.current + liveStudyMs) / 60_000
    }

    const markActivity = () => {
      if (!isStudyContextRef.current) {
        return
      }
      const now = Date.now()
      const idleGap = now - lastActivityRef.current
      if (idleGap > 1_500) {
        idleMsRef.current += idleGap
      }
      lastActivityRef.current = now
    }

    const markMeaningfulAction = () => {
      if (!isStudyContextRef.current) {
        return
      }

      const route = getCurrentRoute()
      const now = Date.now()
      const secondsSinceLastMeaningful = (now - lastMeaningfulActionRef.current) / 1000

      meaningfulActionTimestampsRef.current = [...meaningfulActionTimestampsRef.current, now].filter(
        (stamp) => now - stamp <= 30_000
      )

      if (route.startsWith('/notes')) {
        noteActivityTimestampsRef.current = pruneRecent([...noteActivityTimestampsRef.current, now])
      } else if (route.startsWith('/flashcards')) {
        flashcardActivityTimestampsRef.current = pruneRecent([...flashcardActivityTimestampsRef.current, now])
        if (secondsSinceLastMeaningful >= 1.2) {
          flashcardLatencySamplesRef.current.push(Math.min(secondsSinceLastMeaningful, 18))
          flashcardLatencySamplesRef.current = flashcardLatencySamplesRef.current.slice(-10)
        }
      }

      lastMeaningfulActionRef.current = now
      markActivity()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!syncStudyContext()) {
        return
      }

      const now = Date.now()
      keypressesRef.current.push(now)
      if (lastKeyRef.current) {
        pausesRef.current.push(Math.min((now - lastKeyRef.current) / 1000, 10))
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        backspaceCountRef.current += 1
      }
      lastKeyRef.current = now

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
      if (!isStudyContextRef.current) {
        return
      }

      if (lastMouseRef.current) {
        const dx = event.clientX - lastMouseRef.current.x
        const dy = event.clientY - lastMouseRef.current.y
        mouseDistanceRef.current += Math.sqrt(dx * dx + dy * dy)
      }
      lastMouseRef.current = { x: event.clientX, y: event.clientY }
      markActivity()
    }

    const onVisibility = () => {
      if (!isStudyContextRef.current) {
        syncStudyContext()
        return
      }

      tabSwitchCountRef.current += document.hidden ? 1 : 0
      const webcamState = usePreChaosStore.getState().webcamState
      if (document.hidden && webcamState !== 'requesting') {
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
      if (!isStudyContextRef.current) {
        return
      }

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
      if (!isStudyContextRef.current) {
        return
      }
      markMeaningfulAction()
    }

    const onFocusIn = () => {
      const route = getCurrentRoute()
      const nowStudyContext = syncStudyContext(route)
      if (!nowStudyContext) {
        return
      }

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

      if (isStudyRoute(previousRoute) && isStudyRoute(route) && previousRoute !== route) {
        routeSwitchCountRef.current += 1
      }
      if (previousRoute.startsWith('/notes') && route.startsWith('/notes') && previousRoute !== route) {
        noteSwitchTimestampsRef.current = pruneRecent([...noteSwitchTimestampsRef.current, Date.now()])
      }

      currentRouteRef.current = route
      routeEnteredAtRef.current = Date.now()
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
      if (!isStudyContextRef.current) {
        return
      }

      let shouldBoostMeaningfulAction = true

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
        if (detail.action === 'flashcard_review') {
          flashcardLatencySamplesRef.current = flashcardLatencySamplesRef.current.slice(-10)
        }
      }

      const shouldLogAppEvent = !(detail.source === 'notes' && detail.action === 'note_keystroke')

      if (shouldLogAppEvent) {
        logEvent({
          type: detail.source === 'notes' ? 'notes' : 'flashcard',
          label: detail.label,
          route,
          importance: detail.importance ?? 'medium'
        })
      }

      if (shouldBoostMeaningfulAction) {
        lastMeaningfulActionRef.current = now
        meaningfulActionTimestampsRef.current = [...meaningfulActionTimestampsRef.current, now].filter(
          (stamp) => now - stamp <= 30_000
        )
      }

      markActivity()
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

    const interval = window.setInterval(() => {
      const now = Date.now()
      const currentRoute = getCurrentRoute()
      currentRouteRef.current = currentRoute

      const recentKeypresses = keypressesRef.current.filter((stamp) => now - stamp <= KEY_WINDOW_MS)
      keypressesRef.current = recentKeypresses
      const recentPauses = pausesRef.current.slice(-20)
      pausesRef.current = recentPauses

      const focusedEditable = getFocusedEditable()
      const currentStudyContext = syncStudyContext(currentRoute, focusedEditable)
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

      const baseContext = {
        route: currentRoute,
        page_name: pageName,
        productive_context: currentStudyContext,
        focused_editable: focusedEditable,
        recent_meaningful_actions: currentStudyContext
          ? Math.max(0, Math.round((30 - Math.min(secondsSinceMeaningfulAction, 30)) / 3))
          : 0,
        recent_event_density: currentStudyContext
          ? Number(Math.min(meaningfulActionTimestampsRef.current.length / 8, 10).toFixed(4))
          : 0,
        route_switches: currentStudyContext ? routeSwitchCountRef.current : 0,
        route_dwell_seconds: Number(routeDwellSeconds.toFixed(4)),
        note_activity: currentStudyContext ? noteActivity : 0,
        note_switches: currentStudyContext ? noteSwitches : 0,
        note_saves: currentStudyContext ? noteSaves : 0,
        typing_speed: 0,
        pause_time: 0,
        typing_variation: 0,
        backspace_count: 0,
        flashcard_activity: currentStudyContext ? flashcardActivity : 0,
        flashcard_answer_latency: 0,
        flashcard_successes: currentStudyContext ? flashcardSuccesses : 0,
        todo_activity: 0,
        todo_completions: 0,
        habit_activity: 0,
        habit_check_ins: 0,
        progress_events: currentStudyContext ? progressEvents : 0,
        reading_mode: false,
        webcam_opt_in: webcamOptInRef.current
      } as const

      if (!currentStudyContext) {
        setAppContext(baseContext)
        routeSwitchCountRef.current = 0
        return
      }

      const typingSpeed = recentKeypresses.length / (KEY_WINDOW_MS / 1000)
      const averagePause = recentPauses.length
        ? recentPauses.reduce((sum, value) => sum + value, 0) / recentPauses.length
        : Math.min(Math.max(secondsSinceLastActivity, 0.18), 1.5)
      const variation = recentPauses.length
        ? Math.sqrt(
            recentPauses.reduce((sum, value) => sum + Math.pow(value - averagePause, 2), 0) / recentPauses.length
          )
        : 0
      const errorScore = Math.min(backspaceCountRef.current / Math.max(recentKeypresses.length, 1), 1)
      const idleTime = Math.min(Math.max(idleMsRef.current / 1000, secondsSinceLastActivity), 30)
      const mouseMovementSpeed = Math.min(mouseDistanceRef.current / (MOVEMENT_SAMPLE_MS / 1000) / 100, 10)
      const tabSwitchFrequency = Math.min(tabSwitchCountRef.current / 10, 5)
      const flashcardAnswerLatency = flashcardLatencySamplesRef.current.length
        ? flashcardLatencySamplesRef.current.reduce((sum, value) => sum + value, 0) /
          flashcardLatencySamplesRef.current.length
        : 0
      const sessionDuration = getStudySessionDurationMinutes(now)

      const deliberatePause =
        !document.hidden &&
        (focusedEditable || secondsSinceMeaningfulAction < 15) &&
        secondsSinceLastActivity >= 2 &&
        secondsSinceLastActivity <= 20

      let adjustedTypingSpeed = typingSpeed
      let adjustedAveragePause = averagePause
      let adjustedVariation = variation
      let adjustedIdleTime = idleTime

      if (deliberatePause) {
        adjustedIdleTime *= 0.25
        adjustedAveragePause = Math.min(averagePause * 0.45, 0.45)
        adjustedVariation = variation * 0.6
        adjustedTypingSpeed = Math.max(typingSpeed, focusedEditable ? 0.18 : 0.08)
      }

      const effectiveFatigueScore =
        now < fatigueHoldUntilRef.current ? fatigueHoldValueRef.current : fatigueScoreRef.current
      if (now >= fatigueHoldUntilRef.current) {
        lastStudyFatigueScoreRef.current = fatigueScoreRef.current
      }

      const nextFeatures = [
        Number(adjustedTypingSpeed.toFixed(4)),
        Number(adjustedAveragePause.toFixed(4)),
        Number(adjustedVariation.toFixed(4)),
        Number(errorScore.toFixed(4)),
        Number(adjustedIdleTime.toFixed(4)),
        Number(mouseMovementSpeed.toFixed(4)),
        Number(tabSwitchFrequency.toFixed(4)),
        Number(sessionDuration.toFixed(4)),
        Number(effectiveFatigueScore.toFixed(4))
      ]

      const previous = lastEmittedFeaturesRef.current
      const smoothedFeatures = previous
        ? nextFeatures.map((value, index) => Number((previous[index] * 0.65 + value * 0.35).toFixed(4)))
        : nextFeatures

      pushBehavior(smoothedFeatures)
      lastEmittedFeaturesRef.current = smoothedFeatures

      setAppContext({
        ...baseContext,
        recent_event_density: Number(Math.min(meaningfulActionTimestampsRef.current.length / 8, 10).toFixed(4)),
        typing_speed: Number(adjustedTypingSpeed.toFixed(4)),
        pause_time: Number(adjustedAveragePause.toFixed(4)),
        typing_variation: Number(adjustedVariation.toFixed(4)),
        backspace_count: backspaceCountRef.current,
        flashcard_answer_latency: Number(flashcardAnswerLatency.toFixed(4)),
        reading_mode: !focusedEditable && adjustedTypingSpeed < 0.2 && adjustedIdleTime < 12
      })

      backspaceCountRef.current = 0
      idleMsRef.current = 0
      mouseDistanceRef.current = 0
      tabSwitchCountRef.current = 0
      routeSwitchCountRef.current = 0
    }, MOVEMENT_SAMPLE_MS)

    return () => {
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

  return { isStudyContext, studyContextEnteredAt }
}
