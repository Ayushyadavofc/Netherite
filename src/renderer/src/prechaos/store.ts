import { create } from 'zustand'

import type {
  BehaviorEvent,
  PreChaosContext,
  PreChaosEvent,
  PredictionHistoryPoint,
  PreChaosBaseline,
  PreChaosFeatureVector,
  PreChaosPrediction,
  PreChaosSidecarState,
  PreChaosStatus,
  SessionReplay,
  WebcamMetrics,
  WebcamState
} from './types'
import { PRECHAOS_WINDOW_SIZE } from './types'

const RECENT_EVENTS_STORAGE_KEY = 'prechaos-recent-events'
const HISTORY_STORAGE_KEY = 'prechaos-history'
const BEHAVIOR_WINDOW_STORAGE_KEY = 'prechaos-behavior-window'
const CURRENT_PREDICTION_STORAGE_KEY = 'prechaos-current-prediction'

const loadStoredRecentEvents = (): PreChaosEvent[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.sessionStorage.getItem(RECENT_EVENTS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as PreChaosEvent[]
    return Array.isArray(parsed) ? parsed.slice(-120) : []
  } catch {
    return []
  }
}

const loadStoredHistory = (): PredictionHistoryPoint[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as PredictionHistoryPoint[]
    return Array.isArray(parsed) ? parsed.slice(-240) : []
  } catch {
    return []
  }
}

const loadStoredBehaviorWindow = (): BehaviorEvent[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.sessionStorage.getItem(BEHAVIOR_WINDOW_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as BehaviorEvent[]
    return Array.isArray(parsed) ? parsed.slice(-PRECHAOS_WINDOW_SIZE) : []
  } catch {
    return []
  }
}

const loadStoredPrediction = (): PreChaosPrediction | null => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.sessionStorage.getItem(CURRENT_PREDICTION_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as PreChaosPrediction
  } catch {
    return null
  }
}

const persistRecentEvents = (events: PreChaosEvent[]) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(RECENT_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(-120)))
  } catch {
    // Ignore storage issues and keep the app usable.
  }
}

const persistHistory = (history: PredictionHistoryPoint[]) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-240)))
  } catch {
    // Ignore storage issues and keep the app usable.
  }
}

const persistBehaviorWindow = (behaviorWindow: BehaviorEvent[]) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(BEHAVIOR_WINDOW_STORAGE_KEY, JSON.stringify(behaviorWindow.slice(-PRECHAOS_WINDOW_SIZE)))
  } catch {
    // Ignore storage issues and keep the app usable.
  }
}

const persistCurrentPrediction = (prediction: PreChaosPrediction | null) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    if (prediction) {
      window.sessionStorage.setItem(CURRENT_PREDICTION_STORAGE_KEY, JSON.stringify(prediction))
    } else {
      window.sessionStorage.removeItem(CURRENT_PREDICTION_STORAGE_KEY)
    }
  } catch {
    // Ignore storage issues and keep the app usable.
  }
}

type PreChaosStore = {
  sidecarState: PreChaosSidecarState
  sidecarReason: string | null
  currentPrediction: PreChaosPrediction | null
  baseline: PreChaosBaseline | null
  history: PredictionHistoryPoint[]
  behaviorWindow: BehaviorEvent[]
  recentEvents: PreChaosEvent[]
  sessionReplays: SessionReplay[]
  appContext: PreChaosContext
  sessionStartedAt: number
  studyContextActive: boolean
  webcamEnabled: boolean
  webcamOptIn: boolean
  webcamState: WebcamState
  webcamPreviewVisible: boolean
  webcamStream: MediaStream | null
  webcamMetrics: WebcamMetrics
  fatigueScore: number
  setSidecarState: (state: PreChaosSidecarState, reason?: string | null) => void
  pushBehavior: (features: PreChaosFeatureVector, timestamp?: number) => void
  setPrediction: (prediction: PreChaosPrediction, timestamp?: number) => void
  setBaseline: (baseline: PreChaosBaseline) => void
  setStudyContextActive: (active: boolean) => void
  setWebcamEnabled: (enabled: boolean) => void
  setWebcamOptIn: (enabled: boolean) => void
  setWebcamState: (state: WebcamState) => void
  setWebcamPreviewVisible: (visible: boolean) => void
  setWebcamStream: (stream: MediaStream | null) => void
  setWebcamMetrics: (metrics: Partial<WebcamMetrics>) => void
  setFatigueScore: (score: number) => void
  setAppContext: (context: Partial<PreChaosContext>) => void
  setSessionReplays: (sessions: SessionReplay[]) => void
  logEvent: (event: Omit<PreChaosEvent, 'id' | 'timestamp'> & { timestamp?: number }) => void
}

const defaultContext: PreChaosContext = {
  route: '/',
  page_name: 'landing',
  productive_context: false,
  focused_editable: false,
  recent_meaningful_actions: 0,
  recent_event_density: 0,
  route_switches: 0,
  route_dwell_seconds: 0,
  note_activity: 0,
  note_switches: 0,
  note_saves: 0,
  typing_speed: 0,
  pause_time: 0,
  typing_variation: 0,
  backspace_count: 0,
  flashcard_activity: 0,
  flashcard_answer_latency: 0,
  flashcard_successes: 0,
  todo_activity: 0,
  todo_completions: 0,
  habit_activity: 0,
  habit_check_ins: 0,
  progress_events: 0,
  reading_mode: false,
  webcam_opt_in: false
}

const defaultWebcamMetrics: WebcamMetrics = {
  face_presence: 0,
  blink_intensity: 0,
  movement: 0,
  lighting: 0,
  confidence: 0,
  preview_frame: undefined,
  left_eye_blink: 0,
  right_eye_blink: 0,
  face_landmarks: [],
  face_outline: [],
  left_eye_outline: [],
  right_eye_outline: [],
  ear: 0,
  left_ear: 0,
  right_ear: 0,
  blink_count: 0,
  low_light: false,
  face_detected: false,
  fatigue_status: 'No face',
  webcam_risk: 0,
  webcam_state: 'No face',
  notes_risk: 0,
  notes_state: 'No notes',
  face_box: null
}

export const usePreChaosStore = create<PreChaosStore>((set) => ({
  sidecarState: 'idle',
  sidecarReason: null,
  currentPrediction: loadStoredPrediction(),
  baseline: null,
  history: loadStoredHistory(),
  behaviorWindow: loadStoredBehaviorWindow(),
  recentEvents: loadStoredRecentEvents(),
  sessionReplays: [],
  appContext: {
    ...defaultContext,
    webcam_opt_in:
      typeof window !== 'undefined' ? window.localStorage.getItem('prechaos-webcam-opt-in') === 'true' : false
  },
  sessionStartedAt: Date.now(),
  studyContextActive: false,
  webcamEnabled: false,
  webcamOptIn:
    typeof window !== 'undefined' ? window.localStorage.getItem('prechaos-webcam-opt-in') === 'true' : false,
  webcamState: 'disabled',
  webcamPreviewVisible:
    typeof window !== 'undefined' ? window.localStorage.getItem('prechaos-webcam-preview') === 'true' : false,
  webcamStream: null,
  webcamMetrics: defaultWebcamMetrics,
  fatigueScore: 0,
  setSidecarState: (state, reason = null) => set({ sidecarState: state, sidecarReason: reason }),
  pushBehavior: (features, timestamp = Date.now()) =>
    set((state) => {
      const nextWindow = [...state.behaviorWindow, { timestamp, features }].slice(-PRECHAOS_WINDOW_SIZE)
      persistBehaviorWindow(nextWindow)
      return { behaviorWindow: nextWindow }
    }),
  setPrediction: (prediction, timestamp = Date.now()) =>
    set((state) => {
      const previousRisk = state.history.length === 0 ? 0 : (state.currentPrediction?.risk ?? prediction.risk)
      const currentRoute = window.location.hash.replace(/^#/, '') || '/'
      const productiveRoute = state.studyContextActive
      const latestFeatures = state.behaviorWindow[state.behaviorWindow.length - 1]?.features
      const activeElement = document.activeElement as HTMLElement | null
      const focusedEditable = Boolean(
        activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable ||
            activeElement.getAttribute('role') === 'textbox')
      )

      let contextualRisk = prediction.risk
      if (state.history.length === 0) {
        contextualRisk *= 0.7
      } else if (state.history.length < 4) {
        contextualRisk *= 0.84
      }
      if (productiveRoute && latestFeatures) {
        const [typingSpeed, , , , idleTime, mouseSpeed, tabSwitches] = latestFeatures
        const quietButEngaged =
          idleTime >= 2 &&
          idleTime <= 20 &&
          typingSpeed < 0.5 &&
          mouseSpeed < 0.25 &&
          tabSwitches < 0.2 &&
          focusedEditable
        const thinkingPause =
          idleTime >= 2 &&
          idleTime <= 12 &&
          typingSpeed < 0.35 &&
          mouseSpeed < 0.2 &&
          tabSwitches < 0.15

        if (quietButEngaged) {
          contextualRisk = Math.min(contextualRisk * 0.58, 0.38)
        } else if (thinkingPause) {
          contextualRisk = Math.min(contextualRisk * 0.72, 0.48)
        }
      }

      const smoothingWeight = state.history.length === 0 ? 0.42 : 0.25
      const smoothedRisk = Number((previousRisk * (1 - smoothingWeight) + contextualRisk * smoothingWeight).toFixed(4))
      const smoothedStatus: PreChaosStatus =
        smoothedRisk < 0.35 ? 'low' : smoothedRisk <= 0.65 ? 'medium' : 'high'
      const smoothedPrediction = {
        ...prediction,
        risk: smoothedRisk,
        status: smoothedStatus
      }
      const nextHistory = [
        ...state.history,
        {
          timestamp,
          risk: smoothedPrediction.risk,
          status: smoothedPrediction.status,
          state: smoothedPrediction.state,
          confidence: smoothedPrediction.confidence,
          focus_score: smoothedPrediction.focus_score,
          fatigue_score: smoothedPrediction.fatigue_score,
          distraction_score: smoothedPrediction.distraction_score,
          reflection_score: smoothedPrediction.reflection_score,
          uncertainty_score: smoothedPrediction.uncertainty_score,
          route: state.appContext.route
        }
      ].slice(-180)
      persistHistory(nextHistory)
      persistCurrentPrediction(smoothedPrediction)
      return {
        currentPrediction: smoothedPrediction,
        history: nextHistory
      }
    }),
  setBaseline: (baseline) => set({ baseline }),
  setStudyContextActive: (active) => set({ studyContextActive: active }),
  setWebcamEnabled: (enabled) => set({ webcamEnabled: enabled }),
  setWebcamOptIn: (enabled) =>
    set((state) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('prechaos-webcam-opt-in', String(enabled))
      }
      return {
        webcamOptIn: enabled,
        appContext: {
          ...state.appContext,
          webcam_opt_in: enabled
        }
      }
    }),
  setWebcamState: (state) => set({ webcamState: state }),
  setWebcamPreviewVisible: (visible) =>
    set(() => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('prechaos-webcam-preview', String(visible))
      }
      return { webcamPreviewVisible: visible }
    }),
  setWebcamStream: (stream) => set({ webcamStream: stream }),
  setWebcamMetrics: (metrics) =>
    set((state) => ({
      webcamMetrics: {
        ...state.webcamMetrics,
        ...metrics
      }
    })),
  setFatigueScore: (score) => set({ fatigueScore: score }),
  setAppContext: (context) =>
    set((state) => ({
      appContext: {
        ...state.appContext,
        ...context
      }
    })),
  setSessionReplays: (sessions) => set({ sessionReplays: sessions }),
  logEvent: (event) =>
    set((state) => {
      const nextEvents = [
        ...state.recentEvents,
        {
          id: crypto.randomUUID(),
          timestamp: event.timestamp ?? Date.now(),
          type: event.type,
          label: event.label,
          route: event.route,
          importance: event.importance
        }
      ].slice(-120)
      persistRecentEvents(nextEvents)
      return {
        recentEvents: nextEvents
      }
    })
}))
