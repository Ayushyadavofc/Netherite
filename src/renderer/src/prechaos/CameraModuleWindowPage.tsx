import { Camera, Clock3, Coffee, BookOpen, Eye, Pause, Play, RotateCcw, SkipForward, TimerReset, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import { preChaosBridge } from './bridge'
import { getConnectionLabel, getPreChaosStateLabel } from './display'
import type { CameraModuleMode, CameraModuleSnapshot, PomodoroAction, PreChaosStateLabel, WebcamPoint } from './types'
import { WEBCAM_UNAVAILABLE_MESSAGE } from './webcam-status'

const HUD_ORANGE = '#ff6a00'
const HUD_ORANGE_SOFT = 'rgba(255, 106, 0, 0.48)'
const HUD_TEXT = 'rgba(255, 242, 232, 0.96)'
const HUD_GLOW = 'rgba(255, 106, 0, 0.38)'
const HUD_FLOW_FPS = 20
const HUD_CANVAS_FPS = 24
const FACE_JAW_INDICES = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]
const NOSE_BRIDGE_INDICES = [10, 168, 6, 197, 195, 5, 4]
const FOREHEAD_INDICES = [54, 68, 10, 297, 284]
const RING_SEGMENTS = 24

type Point = { x: number; y: number }
type FaceBox = { x: number; y: number; width: number; height: number }
type HUDSide = 'left' | 'right'
const WIDGET_IDS = [
  'face-status',
  'updated',
  'snapshot',
  'blink',
  'face-lock',
  'motion',
  'perclos',
  'fatigue',
  'lighting',
  'confidence',
  'head-pose',
  'yawn',
  'webcam',
  'sidecar',
  'timer'
] as const

type WidgetId = (typeof WIDGET_IDS)[number]
type WidgetKind = 'pill' | 'card' | 'timer'
type WidgetTone = 'left' | 'right' | 'center'
type HUDWidget = {
  id: WidgetId
  label: string
  value: string
  kind: WidgetKind
  tone: WidgetTone
  controls?: 'timer'
  connectorId?: HUDConnectionMetricId
}
type HUDWidgetLayout = {
  x: number
  y: number
  width: number
  height: number
  scale: number
  visible: boolean
  zIndex: number
}
type HUDWidgetLayouts = Record<WidgetId, HUDWidgetLayout>
type WidgetInteraction = {
  id: WidgetId
  mode: 'move' | 'resize'
  startX: number
  startY: number
  initialLayout: HUDWidgetLayout
  bounds: {
    width: number
    height: number
  }
}
type FlowLine = {
  points: Point[]
  joints: Point[]
}
type HUDTheme = {
  primary: string
  primarySoft: string
  primaryGlow: string
  foreground: string
  border: string
  surface: string
  surfaceStrong: string
}
type HUDAnchorKey =
  | 'leftTemple'
  | 'eyeMid'
  | 'noseTip'
  | 'noseBridge'
  | 'chin'
  | 'forehead'
  | 'leftCheek'
  | 'rightCheek'
  | 'rightJaw'
type HUDConnectionMetricId = 'snapshot' | 'blink' | 'face-lock' | 'motion' | 'fatigue' | 'lighting' | 'confidence' | 'webcam' | 'sidecar'
type HUDConnectionConfig = {
  anchor: HUDAnchorKey
}

const SUGGESTION_COOLDOWN_MS = 5 * 60 * 1000
const SUGGESTION_AUTO_DISMISS_MS = 60 * 1000

type AdaptiveSuggestion = {
  message: string
  severity: 'medium' | 'high'
  triggeredAt: number
}

const WIDGET_LAYOUT_STORAGE_KEY = 'netherite.camera-module-widget-layout.v1'
const WIDGET_META: Record<WidgetId, { kind: WidgetKind; tone: WidgetTone; shortLabel: string; connectorId?: HUDConnectionMetricId }> = {
  'face-status': { kind: 'pill', tone: 'center', shortLabel: 'Tracking' },
  updated: { kind: 'pill', tone: 'center', shortLabel: 'Updated' },
  snapshot: { kind: 'card', tone: 'left', shortLabel: 'Read', connectorId: 'snapshot' },
  blink: { kind: 'card', tone: 'left', shortLabel: 'Blink', connectorId: 'blink' },
  'face-lock': { kind: 'card', tone: 'left', shortLabel: 'Face Lock', connectorId: 'face-lock' },
  motion: { kind: 'card', tone: 'left', shortLabel: 'Motion', connectorId: 'motion' },
  perclos: { kind: 'card', tone: 'left', shortLabel: 'PERCLOS' },
  fatigue: { kind: 'card', tone: 'right', shortLabel: 'Fatigue', connectorId: 'fatigue' },
  lighting: { kind: 'card', tone: 'right', shortLabel: 'Lighting', connectorId: 'lighting' },
  confidence: { kind: 'card', tone: 'right', shortLabel: 'Confidence', connectorId: 'confidence' },
  'head-pose': { kind: 'card', tone: 'right', shortLabel: 'Head Pose' },
  yawn: { kind: 'card', tone: 'right', shortLabel: 'Yawn' },
  webcam: { kind: 'card', tone: 'right', shortLabel: 'Webcam', connectorId: 'webcam' },
  sidecar: { kind: 'card', tone: 'right', shortLabel: 'Connection', connectorId: 'sidecar' },
  timer: { kind: 'timer', tone: 'center', shortLabel: 'Timer' }
}

const formatPomodoro = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const defaultSnapshot: CameraModuleSnapshot = {
  windowOpen: false,
  mode: 'expanded',
  webcamEnabled: false,
  webcamOptIn: false,
  webcamState: 'disabled',
  webcamMetrics: {
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
    head_pose: 'center',
    perclos: 0,
    yawn_detected: false,
    fatigue_status: 'No face',
    webcam_risk: 0,
    webcam_state: 'No face',
    notes_risk: 0,
    notes_state: 'No notes',
    face_box: null
  },
  fatigueScore: 0,
  sidecarState: 'idle',
  prediction: null,
  dataPulse: { lastSavedAt: 0, magnitude: 0, label: '' },
  pomodoro: null,
  updatedAt: Date.now()
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount
const formatPercent = (value: number) => `${Math.round(value * 100)}%`
const mirrorPoint = (point: WebcamPoint): Point => ({ x: 1 - point.x, y: point.y })
const toDisplayFaceBox = (faceBox: CameraModuleSnapshot['webcamMetrics']['face_box']): FaceBox | null =>
  faceBox ? { x: 1 - faceBox.x - faceBox.width, y: faceBox.y, width: faceBox.width, height: faceBox.height } : null

const getWidgetConstraints = (kind: WidgetKind) => {
  if (kind === 'pill') {
    return { minWidth: 0.13, minHeight: 0.055, maxWidth: 0.34, maxHeight: 0.16 }
  }
  if (kind === 'timer') {
    return { minWidth: 0.17, minHeight: 0.13, maxWidth: 0.36, maxHeight: 0.34 }
  }
  return { minWidth: 0.16, minHeight: 0.095, maxWidth: 0.36, maxHeight: 0.28 }
}

const getDefaultWidgetLayouts = (): HUDWidgetLayouts => ({
  'face-status': { x: 0.025, y: 0.028, width: 0.19, height: 0.062, scale: 1, visible: true, zIndex: 1 },
  updated: { x: 0.735, y: 0.028, width: 0.22, height: 0.062, scale: 1, visible: true, zIndex: 2 },
  snapshot: { x: 0.03, y: 0.17, width: 0.26, height: 0.102, scale: 1, visible: true, zIndex: 3 },
  blink: { x: 0.03, y: 0.315, width: 0.205, height: 0.09, scale: 1, visible: true, zIndex: 4 },
  'face-lock': { x: 0.03, y: 0.445, width: 0.205, height: 0.09, scale: 1, visible: true, zIndex: 5 },
  motion: { x: 0.03, y: 0.575, width: 0.205, height: 0.09, scale: 1, visible: true, zIndex: 6 },
  perclos: { x: 0.03, y: 0.705, width: 0.205, height: 0.09, scale: 1, visible: true, zIndex: 7 },
  fatigue: { x: 0.79, y: 0.18, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 8 },
  lighting: { x: 0.79, y: 0.305, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 9 },
  confidence: { x: 0.79, y: 0.43, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 10 },
  'head-pose': { x: 0.79, y: 0.555, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 11 },
  yawn: { x: 0.79, y: 0.68, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 12 },
  webcam: { x: 0.79, y: 0.805, width: 0.19, height: 0.09, scale: 1, visible: true, zIndex: 13 },
  sidecar: { x: 0.62, y: 0.875, width: 0.2, height: 0.085, scale: 0.95, visible: true, zIndex: 14 },
  timer: { x: 0.03, y: 0.79, width: 0.2, height: 0.16, scale: 1, visible: true, zIndex: 15 }
})

const clampWidgetLayout = (id: WidgetId, layout: HUDWidgetLayout): HUDWidgetLayout => {
  const constraints = getWidgetConstraints(WIDGET_META[id].kind)
  const width = clamp(Number.isFinite(layout.width) ? layout.width : constraints.minWidth, constraints.minWidth, constraints.maxWidth)
  const height = clamp(Number.isFinite(layout.height) ? layout.height : constraints.minHeight, constraints.minHeight, constraints.maxHeight)

  return {
    x: clamp(Number.isFinite(layout.x) ? layout.x : 0.04, 0.015, 0.985 - width),
    y: clamp(Number.isFinite(layout.y) ? layout.y : 0.04, 0.015, 0.985 - height),
    width,
    height,
    scale: clamp(Number.isFinite(layout.scale) ? layout.scale : 1, 0.75, 1.65),
    visible: layout.visible !== false,
    zIndex: Math.max(1, Math.round(Number.isFinite(layout.zIndex) ? layout.zIndex : 1))
  }
}

const normalizeWidgetLayouts = (candidate?: Partial<HUDWidgetLayouts> | null): HUDWidgetLayouts => {
  const defaults = getDefaultWidgetLayouts()
  return WIDGET_IDS.reduce((result, id) => {
    const nextLayout = candidate?.[id]
    result[id] = clampWidgetLayout(
      id,
      nextLayout
        ? {
            ...defaults[id],
            ...nextLayout
          }
        : defaults[id]
    )
    return result
  }, {} as HUDWidgetLayouts)
}

const readWidgetLayouts = (): HUDWidgetLayouts => {
  if (typeof window === 'undefined') {
    return normalizeWidgetLayouts()
  }

  try {
    const raw = window.localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY)
    if (!raw) {
      return normalizeWidgetLayouts()
    }
    return normalizeWidgetLayouts(JSON.parse(raw) as Partial<HUDWidgetLayouts>)
  } catch {
    return normalizeWidgetLayouts()
  }
}

const getNextWidgetZIndex = (layouts: HUDWidgetLayouts) => Math.max(...Object.values(layouts).map((layout) => layout.zIndex), 0) + 1


const averagePoints = (points: Point[], fallback: Point): Point =>
  points.length === 0
    ? fallback
    : {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length
      }

const getLandmark = (landmarks: Point[], index: number, fallback: Point) => landmarks[index] ?? fallback
const getAverageLandmark = (landmarks: Point[], indices: number[], fallback: Point) =>
  averagePoints(indices.map((index) => landmarks[index]).filter(Boolean) as Point[], fallback)

const HUD_CONNECTION_CONFIG: Record<HUDConnectionMetricId, HUDConnectionConfig> = {
  snapshot: { anchor: 'leftTemple' },
  blink: { anchor: 'eyeMid' },
  'face-lock': { anchor: 'noseTip' },
  motion: { anchor: 'chin' },
  fatigue: { anchor: 'forehead' },
  lighting: { anchor: 'leftCheek' },
  confidence: { anchor: 'rightCheek' },
  webcam: { anchor: 'rightCheek' },
  sidecar: { anchor: 'rightJaw' }
}

const readThemeValue = (styles: CSSStyleDeclaration, property: string, fallback: string) => {
  const value = styles.getPropertyValue(property).trim()
  return value || fallback
}

const readHUDTheme = (): HUDTheme => {
  const styles = window.getComputedStyle(document.documentElement)
  return {
    primary: readThemeValue(styles, '--nv-primary', HUD_ORANGE),
    primarySoft: readThemeValue(styles, '--nv-primary-soft', HUD_ORANGE_SOFT),
    primaryGlow: readThemeValue(styles, '--nv-primary-glow', HUD_GLOW),
    foreground: readThemeValue(styles, '--nv-foreground', HUD_TEXT),
    border: readThemeValue(styles, '--nv-border', 'rgba(255, 106, 0, 0.18)'),
    surface: readThemeValue(styles, '--nv-surface', 'rgba(8,10,14,0.18)'),
    surfaceStrong: readThemeValue(styles, '--nv-surface-strong', 'rgba(8,10,14,0.24)')
  }
}

const dedupeFlowPoints = (points: Point[]) =>
  points.filter((point, index) => {
    if (index === 0) return true
    const previous = points[index - 1]
    return Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5
  })

export const getHUDPath = (start: Point, end: Point, side: HUDSide): FlowLine => {
  const laneBand = Math.max(0, Math.round(start.y / 96) - 1)
  const laneInset = 34 + laneBand * 16
  const laneX =
    side === 'left'
      ? clamp(start.x + laneInset, start.x + 18, end.x - 26)
      : clamp(start.x - laneInset, end.x + 26, start.x - 18)
  const rawPoints = [
    start,
    { x: laneX, y: start.y },
    { x: laneX, y: end.y },
    end
  ]

  const points = dedupeFlowPoints(rawPoints)
  return {
    points,
    joints: points.slice(1, -1)
  }
}

export default function CameraModuleWindowPage() {
  const [snapshot, setSnapshot] = useState(defaultSnapshot)
  const [memoryWheelEnabled, setMemoryWheelEnabled] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [widgetLayouts, setWidgetLayouts] = useState<HUDWidgetLayouts>(() => readWidgetLayouts())
  const [hudTheme, setHudTheme] = useState<HUDTheme>(() => readHUDTheme())
  const [flowLines, setFlowLines] = useState<Record<string, FlowLine>>({})
  const [activeSuggestion, setActiveSuggestion] = useState<AdaptiveSuggestion | null>(null)
  const [widgetHoverState, setWidgetHoverState] = useState<{ id: WidgetId; mode: WidgetInteraction['mode'] } | null>(null)
  const lastSuggestionDismissedAtRef = useRef(0)
  const stopwatchRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const panelRefs = useRef<Record<WidgetId, HTMLDivElement | null>>({} as Record<WidgetId, HTMLDivElement | null>)
  const connectorStateRef = useRef<Record<string, { start: Point; end: Point }>>({})
  const activeWidgetInteractionRef = useRef<WidgetInteraction | null>(null)

  useEffect(() => {
    let cancelled = false
    void preChaosBridge
      .getCameraModuleState()
      .then((initial) => {
        if (!cancelled) setSnapshot(initial)
      })
      .catch(() => {
        if (!cancelled) setSnapshot(defaultSnapshot)
      })
    const unsubscribe = preChaosBridge.onCameraModuleState((next) => {
      if (!cancelled) setSnapshot(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const node = snapshot.mode === 'stopwatch' ? stopwatchRef.current : hostRef.current
    if (!node) return
    const update = () => setViewport({ width: node.clientWidth, height: node.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [snapshot.mode])

  useEffect(() => {
    const syncTheme = () => setHudTheme(readHUDTheme())
    syncTheme()

    const root = document.documentElement
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('storage', syncTheme)
    window.addEventListener('local-storage', syncTheme)

    return () => {
      observer.disconnect()
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('local-storage', syncTheme)
    }
  }, [])

  useEffect(() => {
    const handleSecretToggle = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        setMemoryWheelEnabled((current) => !current)
      }
    }
    window.addEventListener('keydown', handleSecretToggle)
    return () => window.removeEventListener('keydown', handleSecretToggle)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(widgetLayouts))
  }, [widgetLayouts])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const activeWidget = activeWidgetInteractionRef.current
      if (!activeWidget) return

      const deltaX = (event.clientX - activeWidget.startX) / activeWidget.bounds.width
      const deltaY = (event.clientY - activeWidget.startY) / activeWidget.bounds.height

      setWidgetLayouts((current) => {
        const baseLayout = activeWidget.initialLayout
        const nextLayout =
          activeWidget.mode === 'move'
            ? {
                ...baseLayout,
                x: baseLayout.x + deltaX,
                y: baseLayout.y + deltaY
              }
            : {
                ...baseLayout,
                width: baseLayout.width + deltaX,
                height: baseLayout.height + deltaY
              }

        return {
          ...current,
          [activeWidget.id]: clampWidgetLayout(activeWidget.id, nextLayout)
        }
      })
    }

    const stopInteraction = () => {
      activeWidgetInteractionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopInteraction)
    window.addEventListener('pointercancel', stopInteraction)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopInteraction)
      window.removeEventListener('pointercancel', stopInteraction)
    }
  }, [])

  const isWidgetControlTarget = useCallback((target: EventTarget | null) => {
    return target instanceof HTMLElement && Boolean(target.closest('[data-widget-control="true"]'))
  }, [])

  const getWidgetPointerMode = useCallback((event: ReactPointerEvent<HTMLDivElement>): WidgetInteraction['mode'] => {
    const rect = event.currentTarget.getBoundingClientRect()
    const hotspot = clamp(Math.min(rect.width, rect.height) * 0.18, 14, 26)
    return event.clientX >= rect.right - hotspot && event.clientY >= rect.bottom - hotspot ? 'resize' : 'move'
  }, [])

  const beginWidgetInteraction = useCallback(
    (widgetId: WidgetId, mode: WidgetInteraction['mode'], event: ReactPointerEvent<HTMLButtonElement | HTMLDivElement>) => {
      const host = hostRef.current
      if (!host) return

      event.preventDefault()
      event.stopPropagation()

      const hostRect = host.getBoundingClientRect()
      setWidgetLayouts((current) => {
        const raisedLayout = clampWidgetLayout(widgetId, {
          ...current[widgetId],
          zIndex: getNextWidgetZIndex(current)
        })

        activeWidgetInteractionRef.current = {
          id: widgetId,
          mode,
          startX: event.clientX,
          startY: event.clientY,
          initialLayout: raisedLayout,
          bounds: {
            width: Math.max(hostRect.width, 1),
            height: Math.max(hostRect.height, 1)
          }
        }

        return {
          ...current,
          [widgetId]: raisedLayout
        }
      })
    },
    []
  )

  const toggleWidgetVisibility = useCallback((widgetId: WidgetId) => {
    setWidgetLayouts((current) => {
      const nextVisible = !current[widgetId].visible
      const nextLayout = clampWidgetLayout(widgetId, {
        ...current[widgetId],
        visible: nextVisible,
        zIndex: nextVisible ? getNextWidgetZIndex(current) : current[widgetId].zIndex
      })

      return {
        ...current,
        [widgetId]: nextLayout
      }
    })
  }, [])

  const resetWidgetLayouts = useCallback(() => {
    setWidgetLayouts(normalizeWidgetLayouts())
  }, [])

  // Pomodoro action sender
  const sendPomodoroAction = useCallback((action: PomodoroAction) => {
    preChaosBridge.syncCameraModuleState({ pomodoroAction: action })
  }, [])

  // Adaptive suggestion logic
  useEffect(() => {
    const pom = snapshot.pomodoro
    const prediction = snapshot.prediction
    if (!pom || pom.phase !== 'studying' || !pom.isRunning || !prediction) {
      setActiveSuggestion(null)
      return
    }

    const now = Date.now()
    if (now - lastSuggestionDismissedAtRef.current < SUGGESTION_COOLDOWN_MS) {
      return
    }

    const state = prediction.state as PreChaosStateLabel
    let nextSuggestion: AdaptiveSuggestion | null = null

    if (state === 'distracted') {
      nextSuggestion = {
        message: 'You seem distracted. Consider a short break.',
        severity: 'medium',
        triggeredAt: now
      }
    } else if (state === 'fatigued') {
      nextSuggestion = {
        message: 'Fatigue detected. A break now will help you retain more.',
        severity: 'medium',
        triggeredAt: now
      }
    } else if (state === 'overloaded') {
      nextSuggestion = {
        message: "You're overloaded. Step away for a few minutes.",
        severity: 'high',
        triggeredAt: now
      }
    }

    if (nextSuggestion && !activeSuggestion) {
      setActiveSuggestion(nextSuggestion)
    } else if (!nextSuggestion && activeSuggestion) {
      // State improved, keep showing current suggestion until dismissed or auto-dismissed
    }
  }, [snapshot.pomodoro, snapshot.prediction, activeSuggestion])

  // Auto-dismiss suggestion after 60 seconds
  useEffect(() => {
    if (!activeSuggestion) return
    const elapsed = Date.now() - activeSuggestion.triggeredAt
    const remaining = Math.max(0, SUGGESTION_AUTO_DISMISS_MS - elapsed)
    const timer = window.setTimeout(() => {
      setActiveSuggestion(null)
      lastSuggestionDismissedAtRef.current = Date.now()
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [activeSuggestion])

  const dismissSuggestion = useCallback(() => {
    setActiveSuggestion(null)
    lastSuggestionDismissedAtRef.current = Date.now()
  }, [])

  const handleTakeBreak = useCallback(() => {
    const pom = snapshot.pomodoro
    const isOverloaded = snapshot.prediction?.state === 'overloaded'
    const extraMs = isOverloaded ? 3 * 60 * 1000 : 0
    sendPomodoroAction({ type: 'takeBreak', extraBreakMs: extraMs })
    setActiveSuggestion(null)
    lastSuggestionDismissedAtRef.current = Date.now()
  }, [snapshot.pomodoro, snapshot.prediction?.state, sendPomodoroAction])

  const previewReady = Boolean(snapshot.webcamMetrics.preview_frame)
  const confidencePercent = Math.round((snapshot.prediction?.confidence ?? snapshot.webcamMetrics.confidence) * 100)
  const updatedAtLabel = useMemo(
    () => new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [snapshot.updatedAt]
  )

  const displayLandmarks = useMemo(
    () => snapshot.webcamMetrics.face_landmarks.map(mirrorPoint),
    [snapshot.webcamMetrics.face_landmarks]
  )
  const displayFaceBox = useMemo(() => toDisplayFaceBox(snapshot.webcamMetrics.face_box), [snapshot.webcamMetrics.face_box])
  const faceCenter = useMemo(() => {
    if (displayFaceBox) {
      return { x: displayFaceBox.x + displayFaceBox.width / 2, y: displayFaceBox.y + displayFaceBox.height / 2 }
    }
    return { x: 0.5, y: 0.5 }
  }, [displayFaceBox])

  const leftEye = getAverageLandmark(displayLandmarks, [33, 133, 159, 145], faceCenter)
  const rightEye = getAverageLandmark(displayLandmarks, [362, 263, 386, 374], faceCenter)
  const getFaceBoxAnchor = (xRatio: number, yRatio: number): Point =>
    displayFaceBox
      ? {
          x: displayFaceBox.x + displayFaceBox.width * xRatio,
          y: displayFaceBox.y + displayFaceBox.height * yRatio
        }
      : faceCenter
  const eyeMid = averagePoints(
    [getLandmark(displayLandmarks, 33, leftEye), getLandmark(displayLandmarks, 263, rightEye)],
    averagePoints([leftEye, rightEye], faceCenter)
  )
  const leftTemple = getAverageLandmark(displayLandmarks, [54, 103, 67], getFaceBoxAnchor(0.24, 0.26))
  const forehead = getLandmark(displayLandmarks, 10, getFaceBoxAnchor(0.5, 0.06))
  const noseTip = getAverageLandmark(displayLandmarks, [1, 4, 195], getFaceBoxAnchor(0.5, 0.48))
  const noseBridge = averagePoints(
    [getLandmark(displayLandmarks, 168, faceCenter), getLandmark(displayLandmarks, 133, faceCenter), getLandmark(displayLandmarks, 362, faceCenter)],
    getFaceBoxAnchor(0.5, 0.38)
  )
  const chin = getLandmark(displayLandmarks, 152, getFaceBoxAnchor(0.5, 0.92))
  const leftJaw = getAverageLandmark(displayLandmarks, [234, 93, 132], faceCenter)
  const rightJaw = getAverageLandmark(displayLandmarks, [454, 323, 361], faceCenter)
  const leftCheek = getLandmark(displayLandmarks, 234, getFaceBoxAnchor(0.12, 0.55))
  const rightCheek = getLandmark(displayLandmarks, 454, getFaceBoxAnchor(0.88, 0.55))
  const rightJawAnchor = averagePoints([rightJaw], getFaceBoxAnchor(0.78, 0.88))
  const faceScaleX = displayFaceBox?.width ?? 0.26
  const hasTrackedFace = snapshot.webcamMetrics.face_detected && Boolean(displayFaceBox)
  const hudAnchors = useMemo<Record<HUDAnchorKey, Point>>(
    () => ({
      leftTemple,
      eyeMid,
      noseTip,
      noseBridge,
      chin,
      forehead,
      leftCheek,
      rightCheek,
      rightJaw: rightJawAnchor
    }),
    [chin, eyeMid, forehead, leftCheek, leftTemple, noseBridge, noseTip, rightCheek, rightJawAnchor]
  )

  const widgets = useMemo<HUDWidget[]>(() => {
    return [
      {
        id: 'face-status',
        label: 'Tracking',
        value: snapshot.webcamMetrics.face_detected ? 'Face tracked' : getConnectionLabel(snapshot.sidecarState),
        kind: 'pill',
        tone: 'center'
      },
      {
        id: 'updated',
        label: 'Updated',
        value: updatedAtLabel,
        kind: 'pill',
        tone: 'center'
      },
      {
        id: 'snapshot',
        label: 'Current Read',
        value: `${Math.round((snapshot.prediction?.risk ?? 0) * 100)}% ${getPreChaosStateLabel(snapshot.prediction?.state)}`,
        kind: 'card',
        tone: 'left',
        connectorId: 'snapshot'
      },
      {
        id: 'blink',
        label: 'Blink Count',
        value: String(snapshot.webcamMetrics.blink_count),
        kind: 'card',
        tone: 'left',
        connectorId: 'blink'
      },
      {
        id: 'face-lock',
        label: 'Face Lock',
        value: formatPercent(snapshot.webcamMetrics.face_presence),
        kind: 'card',
        tone: 'left',
        connectorId: 'face-lock'
      },
      {
        id: 'motion',
        label: 'Motion',
        value: formatPercent(snapshot.webcamMetrics.movement),
        kind: 'card',
        tone: 'left',
        connectorId: 'motion'
      },
      {
        id: 'perclos',
        label: 'PERCLOS',
        value: formatPercent(snapshot.webcamMetrics.perclos),
        kind: 'card',
        tone: 'left'
      },
      {
        id: 'fatigue',
        label: 'Fatigue',
        value: `${formatPercent(snapshot.fatigueScore)} ${snapshot.webcamMetrics.fatigue_status.toLowerCase()}`,
        kind: 'card',
        tone: 'right',
        connectorId: 'fatigue'
      },
      {
        id: 'lighting',
        label: 'Lighting',
        value: snapshot.webcamMetrics.low_light ? 'Low' : 'Balanced',
        kind: 'card',
        tone: 'right',
        connectorId: 'lighting'
      },
      {
        id: 'confidence',
        label: 'Confidence',
        value: `${confidencePercent}% lock`,
        kind: 'card',
        tone: 'right',
        connectorId: 'confidence'
      },
      {
        id: 'head-pose',
        label: 'Head Pose',
        value: snapshot.webcamMetrics.head_pose,
        kind: 'card',
        tone: 'right'
      },
      {
        id: 'yawn',
        label: 'Yawn',
        value: snapshot.webcamMetrics.yawn_detected ? 'Detected' : 'Clear',
        kind: 'card',
        tone: 'right'
      },
      {
        id: 'webcam',
        label: 'Webcam',
        value: snapshot.webcamState,
        kind: 'card',
        tone: 'right',
        connectorId: 'webcam'
      },
      {
        id: 'sidecar',
        label: 'Connection',
        value: getConnectionLabel(snapshot.sidecarState),
        kind: 'card',
        tone: 'right',
        connectorId: 'sidecar'
      },
      {
        id: 'timer',
        label: snapshot.pomodoro?.phase === 'break' ? 'Break' : 'Study',
        value: snapshot.pomodoro ? formatPomodoro(snapshot.pomodoro.remainingMs) : '25:00',
        kind: 'timer',
        tone: 'center',
        controls: 'timer'
      }
    ]
  }, [confidencePercent, snapshot.fatigueScore, snapshot.pomodoro, snapshot.prediction?.risk, snapshot.prediction?.state, snapshot.sidecarState, snapshot.webcamMetrics.blink_count, snapshot.webcamMetrics.face_detected, snapshot.webcamMetrics.face_presence, snapshot.webcamMetrics.fatigue_status, snapshot.webcamMetrics.head_pose, snapshot.webcamMetrics.low_light, snapshot.webcamMetrics.movement, snapshot.webcamMetrics.perclos, snapshot.webcamMetrics.yawn_detected, snapshot.webcamState, updatedAtLabel])

  const resolvedWidgetLayouts = useMemo(
    () =>
      WIDGET_IDS.reduce((result, id) => {
        result[id] = clampWidgetLayout(id, widgetLayouts[id])
        return result
      }, {} as HUDWidgetLayouts),
    [widgetLayouts]
  )

  const visibleWidgets = useMemo(
    () => widgets.filter((widget) => resolvedWidgetLayouts[widget.id].visible),
    [resolvedWidgetLayouts, widgets]
  )
  const hiddenWidgets = useMemo(
    () => widgets.filter((widget) => !resolvedWidgetLayouts[widget.id].visible),
    [resolvedWidgetLayouts, widgets]
  )

  const connectedWidgets = useMemo(
    () => visibleWidgets.filter((widget): widget is HUDWidget & { connectorId: HUDConnectionMetricId } => Boolean(widget.connectorId)),
    [visibleWidgets]
  )
  const leftCallouts: HUDWidget[] = []
  const rightCallouts: HUDWidget[] = []
  const timerCallout: HUDWidget = widgets.find((widget) => widget.id === 'timer') ?? widgets[0]
  const hudCardStyle = useMemo<CSSProperties>(
    () => ({
      color: hudTheme.foreground,
      background: 'rgba(20, 20, 20, 0.6)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${hudTheme.primaryGlow}`,
      borderRadius: 16,
      boxShadow: `0 14px 36px rgba(0,0,0,0.2), 0 0 18px ${hudTheme.primaryGlow}`
    }),
    [hudTheme]
  )
  const hudPillStyle = useMemo<CSSProperties>(
    () => ({
      color: hudTheme.foreground,
      background: 'rgba(20, 20, 20, 0.6)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      boxShadow: `0 0 18px ${hudTheme.primaryGlow}`,
      border: `1px solid ${hudTheme.primaryGlow}`
    }),
    [hudTheme]
  )

  const pulseAgeMs = Date.now() - snapshot.dataPulse.lastSavedAt
  const memoryWheelActive =
    memoryWheelEnabled && pulseAgeMs < 9000 && snapshot.dataPulse.magnitude >= 0.35 && snapshot.webcamMetrics.face_detected

  const prevModeRef = useRef(snapshot.mode)

  useEffect(() => {
    if (prevModeRef.current === 'expanded' && snapshot.mode !== 'expanded') {
      connectorStateRef.current = {}
      setFlowLines({})
      setWidgetHoverState(null)
    }
    prevModeRef.current = snapshot.mode
  }, [snapshot.mode])

  useEffect(() => {
    const host = hostRef.current
    if (!host || viewport.width === 0 || viewport.height === 0 || !hasTrackedFace) {
      return
    }

    let frameId = 0
    let lastFlowUpdateAt = 0

    const updateFlowLines = (time: number) => {
      if (time - lastFlowUpdateAt < 1000 / HUD_FLOW_FPS) {
        frameId = window.requestAnimationFrame(updateFlowLines)
        return
      }
      lastFlowUpdateAt = time
      const hostRect = host.getBoundingClientRect()
      const width = host.clientWidth
      const height = host.clientHeight

      const clampPoint = (point: Point): Point => ({
        x: clamp(point.x, 0.04, 0.96),
        y: clamp(point.y, 0.05, 0.95)
      })

      const toPixel = (point: Point) => {
        const safePoint = clampPoint(point)
        return { x: safePoint.x * width, y: safePoint.y * height }
      }

      const getPanelAnchor = (widget: HUDWidget, faceAnchor: Point): { point: Point; side: HUDSide } | null => {
        const panel = panelRefs.current[widget.id]
        if (!panel) return null

        const rect = panel.getBoundingClientRect()
        const centerX = rect.left - hostRect.left + rect.width / 2
        const isOnLeft = centerX <= faceAnchor.x

        return {
          point: {
            x: isOnLeft ? rect.right - hostRect.left + 14 : rect.left - hostRect.left - 14,
            y: rect.top - hostRect.top + rect.height / 2
          },
          side: isOnLeft ? 'left' : 'right'
        }
      }

      const nextFlowLines: Record<string, FlowLine> = {}
      const activeIds = new Set<string>()

      for (const widget of connectedWidgets) {
        const connection = HUD_CONNECTION_CONFIG[widget.connectorId]
        const faceAnchor = toPixel(hudAnchors[connection.anchor])
        const panelAnchor = getPanelAnchor(widget, faceAnchor)
        if (!panelAnchor) continue

        activeIds.add(widget.id)
        const previous = connectorStateRef.current[widget.id] ?? { start: panelAnchor.point, end: faceAnchor }

        previous.start = {
          x: lerp(previous.start.x, panelAnchor.point.x, 0.16),
          y: lerp(previous.start.y, panelAnchor.point.y, 0.16)
        }
        previous.end = {
          x: lerp(previous.end.x, faceAnchor.x, 0.22),
          y: lerp(previous.end.y, faceAnchor.y, 0.22)
        }

        connectorStateRef.current[widget.id] = previous
        nextFlowLines[widget.id] = getHUDPath(previous.start, previous.end, panelAnchor.side)
      }

      for (const id of Object.keys(connectorStateRef.current)) {
        if (!activeIds.has(id)) {
          delete connectorStateRef.current[id]
        }
      }

      setFlowLines(nextFlowLines)
      frameId = window.requestAnimationFrame(updateFlowLines)
    }

    frameId = window.requestAnimationFrame(updateFlowLines)
    return () => window.cancelAnimationFrame(frameId)
  }, [connectedWidgets, hasTrackedFace, hudAnchors, viewport.height, viewport.width, snapshot.mode])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host || viewport.width === 0 || viewport.height === 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    let frameId = 0
    let lastRenderedAt = 0

    const renderFrame = (time: number) => {
      if (time - lastRenderedAt < 1000 / HUD_CANVAS_FPS) {
        frameId = window.requestAnimationFrame(renderFrame)
        return
      }
      lastRenderedAt = time
      const dpr = window.devicePixelRatio || 1
      const width = host.clientWidth
      const height = host.clientHeight
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)

      const clampPoint = (point: Point): Point => ({
        x: clamp(point.x, 0.04, 0.96),
        y: clamp(point.y, 0.05, 0.95)
      })
      const toPixel = (point: Point) => {
        const safePoint = clampPoint(point)
        return { x: safePoint.x * width, y: safePoint.y * height }
      }
      const points = displayLandmarks.map(toPixel)

      const drawPolyline = (indices: number[], lineWidth: number, stroke: string, alpha: number, shadow = 0) => {
        if (indices.length < 2) return
        context.save()
        context.beginPath()
        context.lineWidth = lineWidth
        context.strokeStyle = stroke
        context.globalAlpha = alpha
        context.lineCap = 'round'
        context.lineJoin = 'round'
        if (shadow > 0) {
          context.shadowBlur = shadow
          context.shadowColor = stroke
        }
        indices.forEach((index, offset) => {
          const point = points[index]
          if (!point) return
          if (offset === 0) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        })
        context.stroke()
        context.restore()
      }

      const drawEyeRing = (center: Point, radius: number, rotation: number) => {
        const pixel = toPixel(center)
        const buildSegmentPoints = (segmentRadius: number, startAngle: number, endAngle: number, steps: number) =>
          Array.from({ length: steps + 1 }, (_, index) => {
            const angle = lerp(startAngle, endAngle, index / steps)
            return {
              x: Math.cos(angle) * segmentRadius,
              y: Math.sin(angle) * segmentRadius
            }
          })

        const strokeSegmentLoop = (segmentPoints: Point[]) => {
          if (segmentPoints.length < 2) return
          context.beginPath()
          context.moveTo(segmentPoints[0].x, segmentPoints[0].y)
          for (let index = 1; index < segmentPoints.length; index += 1) {
            context.lineTo(segmentPoints[index].x, segmentPoints[index].y)
          }
          context.stroke()
        }

        context.save()
        context.translate(pixel.x, pixel.y)
        context.rotate(rotation)
        context.strokeStyle = hudTheme.primary
        context.shadowBlur = 12
        context.shadowColor = hudTheme.primaryGlow
        context.lineWidth = 1.6
        context.globalAlpha = 0.92
        strokeSegmentLoop(buildSegmentPoints(radius, Math.PI * 0.18, Math.PI * 1.82, 16))
        strokeSegmentLoop(buildSegmentPoints(radius * 0.66, Math.PI * 1.05, Math.PI * 2.12, 8))
        for (let index = 0; index < RING_SEGMENTS; index += 1) {
          const angle = (Math.PI * 2 * index) / RING_SEGMENTS
          const inner = radius * (index % 3 === 0 ? 0.72 : 0.82)
          const outer = radius * (index % 3 === 0 ? 1.08 : 0.96)
          context.globalAlpha = index % 2 === 0 ? 0.65 : 0.28
          context.beginPath()
          context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
          context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
          context.stroke()
        }
        context.restore()
      }

      const drawDots = (landmarks: Point[]) => {
        const pulse = (Math.sin(time * 0.005) + 1) / 2
        context.save()
        for (const landmark of landmarks) {
          const point = toPixel(landmark)
          const radius = lerp(1.8, 4.2, pulse)
          context.globalAlpha = lerp(0.35, 0.85, pulse)
          context.fillStyle = hudTheme.foreground
          context.shadowBlur = 12
          context.shadowColor = hudTheme.primaryGlow
          context.beginPath()
          context.arc(point.x, point.y, radius, 0, Math.PI * 2)
          context.fill()
        }
        context.restore()
      }

      if (displayFaceBox) {
        const x = clamp(displayFaceBox.x, 0.04, 0.86) * width
        const y = clamp(displayFaceBox.y, 0.05, 0.82) * height
        const boxWidth = clamp(displayFaceBox.width, 0.1, 0.42) * width
        const boxHeight = clamp(displayFaceBox.height, 0.12, 0.52) * height
        const scanY = y + (((time * 0.08) % 1) * Math.max(boxHeight, 1))
        context.save()
        context.strokeStyle = hudTheme.primary
        context.globalAlpha = 0.18
        context.setLineDash([10, 14])
        context.strokeRect(x, y, boxWidth, boxHeight)
        context.shadowBlur = 10
        context.shadowColor = hudTheme.primaryGlow
        context.strokeStyle = hudTheme.primary
        context.globalAlpha = 0.32
        context.lineWidth = 1.1
        context.beginPath()
        context.moveTo(x, scanY)
        context.lineTo(x + boxWidth, scanY)
        context.stroke()
        context.restore()
      }

      if (points.length > 0) {
        drawPolyline(FACE_JAW_INDICES, 1.8, hudTheme.primary, 0.68, 12)
        drawPolyline(FACE_JAW_INDICES, 0.9, hudTheme.foreground, 0.82, 0)
        drawPolyline(NOSE_BRIDGE_INDICES, 1.2, hudTheme.foreground, 0.72, 8)
        drawPolyline(FOREHEAD_INDICES, 1, hudTheme.primary, 0.44, 8)

        const ringRotation = time * 0.0026
        const eyeRadius = Math.max(faceScaleX * width * 0.075, 18)
        drawEyeRing(leftEye, eyeRadius, ringRotation)
        drawEyeRing(rightEye, eyeRadius, -ringRotation * 0.92)
        drawDots([forehead, noseBridge, chin, leftJaw, rightJaw])
      }

      if (memoryWheelActive && displayFaceBox) {
        const center = toPixel({
          x: displayFaceBox.x + displayFaceBox.width / 2,
          y: clamp(displayFaceBox.y - displayFaceBox.height * 0.14, 0.06, 0.32)
        })
        const rx = clamp(displayFaceBox.width * width * 0.42, 56, 128)
        const ry = rx * 0.36
        const rotation = time * 0.0018
        context.save()
        context.translate(center.x, center.y)
        context.rotate(rotation)
        context.strokeStyle = hudTheme.primary
        context.lineWidth = 2
        context.shadowBlur = 12
        context.shadowColor = hudTheme.primaryGlow
        context.beginPath()
        context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        context.stroke()
        for (let index = 0; index < 7; index += 1) {
          const angle = (Math.PI * 2 * index) / 7
          const wheelX = Math.cos(angle) * rx * 1.4
          const wheelY = Math.sin(angle) * ry * 1.4
          context.beginPath()
          context.moveTo(0, 0)
          context.lineTo(wheelX, wheelY)
          context.stroke()
          context.beginPath()
          context.arc(wheelX, wheelY, 9, 0, Math.PI * 2)
          context.stroke()
        }
        context.restore()
      }

      frameId = window.requestAnimationFrame(renderFrame)
    }

    frameId = window.requestAnimationFrame(renderFrame)
    return () => window.cancelAnimationFrame(frameId)
  }, [displayFaceBox, displayLandmarks, faceScaleX, leftEye, leftJaw, rightJaw, chin, forehead, noseBridge, rightEye, hudTheme, memoryWheelActive, viewport.height, viewport.width, snapshot.mode])

  const resizeHintStyle = useMemo<CSSProperties>(
    () => ({
      position: 'absolute',
      right: 6,
      bottom: 6,
      width: 16,
      height: 16,
      borderRadius: 6,
      border: `1px solid ${hudTheme.primaryGlow}`,
      background: 'rgba(8, 10, 14, 0.32)',
      boxShadow: `0 0 12px ${hudTheme.primaryGlow}`
    }),
    [hudTheme.primaryGlow]
  )

  const renderWidget = useCallback(
    (widget: HUDWidget) => {
      const layout = resolvedWidgetLayouts[widget.id]
      const widgetHoverMode = widgetHoverState?.id === widget.id ? widgetHoverState.mode : null
      const interactionMode = activeWidgetInteractionRef.current?.id === widget.id ? activeWidgetInteractionRef.current.mode : widgetHoverMode
      const showResizeHint = widgetHoverState?.id === widget.id || activeWidgetInteractionRef.current?.id === widget.id
      const isBreakTimer = widget.controls === 'timer' && snapshot.pomodoro?.phase === 'break'
      const accentColor = isBreakTimer ? 'rgba(255,200,120,0.88)' : hudTheme.primary
      const titleColor = isBreakTimer ? 'rgba(255,200,120,0.88)' : hudTheme.foreground
      const valueShadow = `0 0 16px ${hudTheme.primaryGlow}`
      const widgetPixelWidth = Math.max(1, layout.width * Math.max(viewport.width, 1))
      const widgetPixelHeight = Math.max(1, layout.height * Math.max(viewport.height, 1))
      const widgetScale =
        widget.kind === 'pill'
          ? clamp(Math.min(widgetPixelWidth / 170, widgetPixelHeight / 48), 0.82, 1.8)
          : widget.kind === 'timer'
            ? clamp(Math.min(widgetPixelWidth / 180, widgetPixelHeight / 110), 0.8, 2.4)
            : clamp(Math.min(widgetPixelWidth / 170, widgetPixelHeight / 78), 0.82, 2.1)
      const titleFontSize = `${Math.round((widget.kind === 'timer' ? 10 : 9) * widgetScale)}px`
      const valueFontSize = `${Math.round((widget.kind === 'pill' ? 12 : widget.kind === 'timer' ? 25 : 18) * widgetScale)}px`
      const cardStyle: CSSProperties =
        widget.kind === 'pill'
          ? {
              ...hudPillStyle,
              width: '100%',
              height: '100%',
              borderRadius: 999,
              padding: '8px 14px'
            }
          : {
              ...hudCardStyle,
              width: '100%',
              height: '100%',
              padding: widget.kind === 'timer' ? '12px 12px 10px' : '10px 12px'
            }

      return (
        <div
          key={widget.id}
          className="absolute select-none"
          style={{
            left: `${layout.x * 100}%`,
            top: `${layout.y * 100}%`,
            width: `${layout.width * 100}%`,
            height: `${layout.height * 100}%`,
            zIndex: layout.zIndex,
            pointerEvents: 'auto',
            animation: 'jarvisPulse 3.2s ease-in-out infinite',
            cursor: interactionMode === 'resize' ? 'nwse-resize' : activeWidgetInteractionRef.current?.id === widget.id ? 'grabbing' : 'grab'
          }}
        >
          <div
            ref={(node) => {
              panelRefs.current[widget.id] = node
            }}
            className="relative h-full w-full overflow-hidden"
            style={cardStyle}
            onPointerEnter={() => {
              setWidgetHoverState((current) => (current?.id === widget.id ? current : { id: widget.id, mode: 'move' }))
            }}
            onPointerMove={(event) => {
              if (isWidgetControlTarget(event.target)) return
              const mode = getWidgetPointerMode(event)
              setWidgetHoverState((current) =>
                current?.id === widget.id && current.mode === mode ? current : { id: widget.id, mode }
              )
            }}
            onPointerLeave={() => {
              setWidgetHoverState((current) => (current?.id === widget.id ? null : current))
            }}
            onPointerDown={(event) => {
              if (isWidgetControlTarget(event.target)) return
              if (event.ctrlKey) {
                event.preventDefault()
                event.stopPropagation()
                toggleWidgetVisibility(widget.id)
                return
              }
              beginWidgetInteraction(widget.id, getWidgetPointerMode(event), event)
            }}
          >
            {widget.kind === 'pill' ? (
              <div className="flex h-full w-full items-center justify-center text-center">
                {widget.id === 'updated' ? (
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span className="font-bold uppercase tracking-[0.28em]" style={{ color: hudTheme.foreground, fontSize: titleFontSize }}>
                      {widget.label}
                    </span>
                    <span className="font-black uppercase tracking-[0.18em]" style={{ color: hudTheme.foreground, fontSize: valueFontSize, textShadow: valueShadow }}>
                      {widget.value}
                    </span>
                  </div>
                ) : (
                  <span className="font-black uppercase tracking-[0.24em]" style={{ color: hudTheme.foreground, fontSize: valueFontSize, textShadow: valueShadow }}>
                    {widget.value}
                  </span>
                )}
              </div>
            ) : widget.kind === 'timer' ? (
              <div className="flex h-full w-full flex-col items-center justify-between text-center">
                <div className="w-full">
                  <div className="font-bold uppercase tracking-[0.28em]" style={{ color: titleColor, opacity: 0.98, fontSize: titleFontSize }}>
                    {widget.label}
                  </div>
                  <div className="mx-auto mt-2 h-px w-12" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
                  <div className="mt-2 font-black leading-none tabular-nums" style={{ color: titleColor, fontSize: valueFontSize, textShadow: valueShadow }}>
                    {widget.value}
                  </div>
                </div>
                <div className="pointer-events-auto mt-3 flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    data-widget-control="true"
                    onClick={() => sendPomodoroAction(snapshot.pomodoro?.isRunning ? { type: 'pause' } : { type: 'start' })}
                    className="rounded-full border p-1.5"
                    style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                  >
                    {snapshot.pomodoro?.isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    data-widget-control="true"
                    onClick={() => sendPomodoroAction({ type: 'reset' })}
                    className="rounded-full border p-1.5"
                    style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                  >
                    <TimerReset className="h-3 w-3" />
                  </button>
                  {snapshot.pomodoro?.phase === 'break' && (
                    <button
                      type="button"
                      data-widget-control="true"
                      onClick={() => sendPomodoroAction({ type: 'skipBreak' })}
                      className="rounded-full border p-1.5"
                      style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                      title="Skip Break"
                    >
                      <SkipForward className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={`flex h-full w-full flex-col ${widget.tone === 'right' ? 'items-end text-right' : 'items-start text-left'} justify-center`}>
                <div className="font-bold uppercase tracking-[0.28em]" style={{ color: hudTheme.foreground, opacity: 0.98, fontSize: titleFontSize }}>
                  {widget.label}
                </div>
                {widget.tone === 'right' && <div className="mt-2 h-px w-12" style={{ background: `linear-gradient(270deg, ${hudTheme.primary}, transparent)` }} />}
                <div
                  className="w-full font-black leading-[1.05]"
                  style={{
                    marginTop: widget.tone === 'right' ? 4 : 8,
                    color: hudTheme.foreground,
                    fontSize: valueFontSize,
                    textShadow: valueShadow,
                    wordBreak: 'break-word'
                  }}
                >
                  {widget.value}
                </div>
              </div>
            )}

            <div
              aria-hidden="true"
              className="pointer-events-none transition-opacity duration-150"
              style={{ ...resizeHintStyle, opacity: showResizeHint || interactionMode === 'resize' ? 1 : 0.18 }}
            />
          </div>
        </div>
      )
    },
    [
      beginWidgetInteraction,
      getWidgetPointerMode,
      hudCardStyle,
      hudPillStyle,
      hudTheme.foreground,
      hudTheme.primary,
      hudTheme.primaryGlow,
      isWidgetControlTarget,
      resolvedWidgetLayouts,
      resizeHintStyle,
      sendPomodoroAction,
      snapshot.pomodoro,
      toggleWidgetVisibility,
      viewport.height,
      viewport.width,
      widgetHoverState
    ]
  )

  const handleModeChange = async (mode: CameraModuleMode) => setSnapshot(await preChaosBridge.setCameraModuleMode(mode))

  const stopwatchScale = clamp(Math.min((viewport.width || 340) / 340, (viewport.height || 220) / 220), 0.72, 1.55)
  const stopwatchStatusFontSize = `${Math.round(clamp(10 * stopwatchScale, 8, 14))}px`
  const stopwatchTimerFontSize = `${Math.round(clamp(Math.min((viewport.width || 340) * 0.26, (viewport.height || 220) * 0.34), 28, 86))}px`
  const stopwatchButtonInset = `${Math.round(clamp(8 * stopwatchScale, 6, 12))}px`
  const stopwatchIconSize = clamp(14 * stopwatchScale, 11, 18)
  const stopwatchGap = Math.round(clamp(20 * stopwatchScale, 10, 28))

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      <style>{`@keyframes jarvisPulse{0%,100%{opacity:.7;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}`}</style>
      <header
        className="z-50 flex h-11 w-full shrink-0 items-center justify-between border-b border-[var(--nv-border)] bg-[var(--nv-bg)] pl-3"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <Camera className="h-3.5 w-3.5 text-[var(--nv-primary)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.24em]">Camera Module</span>
        </div>
        <div className="flex h-full items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button
            type="button"
            onClick={() => void handleModeChange('stopwatch')}
            className={`h-full px-2.5 ${
              snapshot.mode === 'stopwatch'
                ? 'text-[var(--nv-primary)]'
                : 'text-[var(--nv-subtle)] hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]'
            }`}
            title="Stopwatch"
          >
            <Clock3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleModeChange('expanded')}
            className={`h-full px-2.5 ${
              snapshot.mode === 'expanded'
                ? 'text-[var(--nv-primary)]'
                : 'text-[var(--nv-subtle)] hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]'
            }`}
            title="Camera"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void preChaosBridge.closeCameraModule()}
            className="h-full border-l border-[var(--nv-border)] px-2.5 text-[var(--nv-subtle)] hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {snapshot.mode === 'stopwatch' ? (
        <div
          ref={stopwatchRef}
          className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3"
          style={{ gap: `${stopwatchGap}px` }}
        >
          <div
            className="flex items-center gap-2 font-bold uppercase tracking-[0.28em]"
            style={{
              color: snapshot.pomodoro?.phase === 'break' ? 'rgba(255,200,120,0.85)' : hudTheme.primary,
              fontSize: stopwatchStatusFontSize
            }}
          >
            {snapshot.pomodoro?.phase === 'break' ? (
              <Coffee style={{ width: stopwatchIconSize, height: stopwatchIconSize }} />
            ) : (
              <BookOpen style={{ width: stopwatchIconSize, height: stopwatchIconSize }} />
            )}
            {snapshot.pomodoro?.phase === 'break' ? 'Break' : snapshot.pomodoro?.phase === 'studying' ? 'Studying' : 'Ready'}
          </div>
          <button
            type="button"
            onClick={() => sendPomodoroAction(snapshot.pomodoro?.isRunning ? { type: 'pause' } : { type: 'start' })}
            className="max-w-full font-black tabular-nums tracking-tight leading-none"
            style={{
              fontSize: stopwatchTimerFontSize,
              color: snapshot.pomodoro?.phase === 'break' ? 'rgba(255,200,120,0.9)' : hudTheme.foreground,
              textShadow: `0 0 18px ${hudTheme.primaryGlow}`
            }}
          >
            {snapshot.pomodoro ? formatPomodoro(snapshot.pomodoro.remainingMs) : '25:00'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sendPomodoroAction(snapshot.pomodoro?.isRunning ? { type: 'pause' } : { type: 'start' })}
              className="rounded-full border"
              style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
            >
              {snapshot.pomodoro?.isRunning ? (
                <Pause className="text-[var(--nv-primary)]" style={{ width: stopwatchIconSize, height: stopwatchIconSize, margin: stopwatchButtonInset }} />
              ) : (
                <Play className="text-[var(--nv-primary)]" style={{ width: stopwatchIconSize, height: stopwatchIconSize, margin: stopwatchButtonInset }} />
              )}
            </button>
            <button type="button" onClick={() => sendPomodoroAction({ type: 'reset' })} className="rounded-full border" style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}>
              <TimerReset className="text-[var(--nv-primary)]" style={{ width: stopwatchIconSize, height: stopwatchIconSize, margin: stopwatchButtonInset }} />
            </button>
            {snapshot.pomodoro?.phase === 'break' && (
              <button type="button" onClick={() => sendPomodoroAction({ type: 'skipBreak' })} className="rounded-full border" style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }} title="Skip Break">
                <SkipForward className="text-[var(--nv-primary)]" style={{ width: stopwatchIconSize, height: stopwatchIconSize, margin: stopwatchButtonInset }} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden p-5">
          <div
            ref={hostRef}
            className="relative h-full overflow-hidden rounded-[28px] bg-transparent"
            style={{ border: `1px solid ${hudTheme.primaryGlow}` }}
          >
            <div className="absolute inset-0 z-[1]">
              {snapshot.webcamOptIn && previewReady ? (
                <>
                  <img
                    src={snapshot.webcamMetrics.preview_frame}
                    alt="Tracked camera preview"
                    className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, rgba(4,7,10,0.06), rgba(4,7,10,0.12))', backdropFilter: 'blur(0.9px)' }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,106,0,0.18),transparent_24%),linear-gradient(135deg,rgba(10,10,12,0.98),rgba(5,5,8,0.96))]" />
              )}
            </div>

            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] h-full w-full" />
            <svg
              className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
              viewBox={`0 0 ${viewport.width || 1} ${viewport.height || 1}`}
              preserveAspectRatio="none"
            >
              <defs>
                <filter id="hud-flow-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {hasTrackedFace &&
                Object.entries(flowLines).map(([id, flowLine]) => {
                  const points = flowLine.points.map((point) => `${point.x},${point.y}`).join(' ')
                  const startPoint = flowLine.points[0]
                  const endPoint = flowLine.points[flowLine.points.length - 1]

                  return (
                    <g key={id} filter="url(#hud-flow-glow)">
                      <polyline
                        points={points}
                        fill="none"
                        stroke={hudTheme.primaryGlow}
                        strokeWidth="2.1"
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                      />
                      <polyline
                        points={points}
                        fill="none"
                        stroke={hudTheme.primary}
                        strokeWidth="0.95"
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                      />
                      <circle cx={startPoint.x} cy={startPoint.y} r="2.2" fill={hudTheme.foreground} stroke={hudTheme.primary} strokeWidth="0.7" />
                      <circle cx={endPoint.x} cy={endPoint.y} r="2.2" fill={hudTheme.foreground} stroke={hudTheme.primary} strokeWidth="0.7" />
                    </g>
                  )
                })}
            </svg>

            <div className="absolute inset-0 z-[4]">
              {visibleWidgets.map(renderWidget)}

              <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[12] flex justify-center">
                <div
                  className="pointer-events-auto flex max-w-[80%] flex-wrap items-center justify-center gap-2 rounded-full px-3 py-2"
                  style={hudPillStyle}
                >
                  <button
                    type="button"
                    data-widget-control="true"
                    onClick={resetWidgetLayouts}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{ border: `1px solid ${hudTheme.primaryGlow}`, color: hudTheme.primary }}
                    title="Reset widget layout"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Layout
                  </button>
                  {hiddenWidgets.map((widget) => (
                    <button
                      key={widget.id}
                      type="button"
                      data-widget-control="true"
                      onClick={() => toggleWidgetVisibility(widget.id)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                      style={{ border: '1px solid rgba(255,255,255,0.18)', color: hudTheme.foreground }}
                      title={`Show ${widget.label}`}
                    >
                      <Eye className="h-3 w-3" />
                      {WIDGET_META[widget.id].shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hidden pointer-events-none absolute inset-x-4 top-4 items-start justify-between text-[10px] font-bold uppercase tracking-[0.28em]">
                <div className="rounded-full px-3 py-1.5" style={hudPillStyle}>
                  {snapshot.webcamMetrics.face_detected ? 'Face tracked' : getConnectionLabel(snapshot.sidecarState)}
                </div>
                <div className="rounded-full px-3 py-1.5" style={hudPillStyle}>
                  Updated {updatedAtLabel}
                </div>
              </div>

              <div className="hidden pointer-events-none absolute left-5 top-24 flex-col items-start gap-4">
                {leftCallouts.map((callout) => (
                  <div key={callout.id} className="select-none" style={{ animation: 'jarvisPulse 3.2s ease-in-out infinite' }}>
                    <div
                      ref={(node) => {
                        panelRefs.current[callout.id] = node
                      }}
                      style={hudCardStyle}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: hudTheme.foreground, opacity: 0.98 }}>
                        {callout.label}
                      </div>
                      <div className="mt-1 text-lg font-black leading-none" style={{ color: hudTheme.foreground, textShadow: `0 0 16px ${hudTheme.primaryGlow}` }}>
                        {callout.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden pointer-events-none absolute right-5 top-24 flex-col items-end gap-4">
                {rightCallouts.map((callout) => (
                  <div key={callout.id} className="select-none" style={{ animation: 'jarvisPulse 3.2s ease-in-out infinite' }}>
                    <div
                      ref={(node) => {
                        panelRefs.current[callout.id] = node
                      }}
                      style={hudCardStyle}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-right" style={{ color: hudTheme.foreground, opacity: 0.98 }}>
                        {callout.label}
                      </div>
                      <div className="mt-2 ml-auto h-px w-12" style={{ background: `linear-gradient(270deg, ${hudTheme.primary}, transparent)` }} />
                      <div className="mt-1 text-right text-lg font-black leading-none" style={{ color: hudTheme.foreground, textShadow: `0 0 16px ${hudTheme.primaryGlow}` }}>
                        {callout.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {false && timerCallout && (
                <div className="absolute bottom-5 left-5 select-none" style={{ animation: 'jarvisPulse 3.2s ease-in-out infinite' }}>
                  <div
                    ref={(node) => {
                      panelRefs.current[timerCallout.id] = node
                    }}
                    style={{
                      ...hudCardStyle,
                      minWidth: 140,
                      maxWidth: 200,
                      padding: '10px 12px'
                    }}
                  >
                    <div className="text-center text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: snapshot.pomodoro?.phase === 'break' ? 'rgba(255,200,120,0.85)' : hudTheme.foreground, opacity: 0.98 }}>
                      {snapshot.pomodoro?.phase === 'break' ? 'Break' : 'Study'}
                    </div>
                    <div className="mx-auto mt-2 h-px w-12" style={{ background: `linear-gradient(90deg, transparent, ${snapshot.pomodoro?.phase === 'break' ? 'rgba(255,200,120,0.6)' : hudTheme.primary}, transparent)` }} />
                    <div className="mt-1 text-center text-base font-black leading-none" style={{ color: snapshot.pomodoro?.phase === 'break' ? 'rgba(255,200,120,0.9)' : hudTheme.foreground, textShadow: `0 0 16px ${hudTheme.primaryGlow}` }}>
                      {timerCallout.value}
                    </div>
                    <div className="pointer-events-auto mt-2 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => sendPomodoroAction(snapshot.pomodoro?.isRunning ? { type: 'pause' } : { type: 'start' })}
                        className="rounded-full border p-1"
                        style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                      >
                        {snapshot.pomodoro?.isRunning ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendPomodoroAction({ type: 'reset' })}
                        className="rounded-full border p-1"
                        style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                      >
                        <TimerReset className="h-2.5 w-2.5" />
                      </button>
                      {snapshot.pomodoro?.phase === 'break' && (
                        <button
                          type="button"
                          onClick={() => sendPomodoroAction({ type: 'skipBreak' })}
                          className="rounded-full border p-1"
                          style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                          title="Skip Break"
                        >
                          <SkipForward className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSuggestion && (
                <div className="pointer-events-auto absolute bottom-5 right-5 z-[10] max-w-[260px] select-none" style={{ animation: 'jarvisPulse 3.2s ease-in-out infinite' }}>
                  <div
                    style={{
                      ...hudCardStyle,
                      minWidth: 200,
                      maxWidth: 260,
                      padding: '12px 14px',
                      borderColor: activeSuggestion.severity === 'high' ? 'rgba(255, 100, 60, 0.6)' : hudTheme.primaryGlow
                    }}
                  >
                    <div className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: activeSuggestion.severity === 'high' ? 'rgba(255, 120, 80, 0.95)' : hudTheme.primary }}>
                      Adaptive Suggestion
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: hudTheme.foreground }}>
                      {activeSuggestion.message}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTakeBreak}
                        className="rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                        style={{
                          background: 'rgba(255, 106, 0, 0.18)',
                          color: hudTheme.primary,
                          border: `1px solid ${hudTheme.primaryGlow}`
                        }}
                      >
                        Take Break Now
                      </button>
                      <button
                        type="button"
                        onClick={dismissSuggestion}
                        className="rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                        style={{
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.5)',
                          border: '1px solid rgba(255,255,255,0.12)'
                        }}
                      >
                        Keep Going
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {memoryWheelActive && (
                <div className="pointer-events-none absolute left-1/2 top-[8%] -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em]" style={hudPillStyle}>
                  {snapshot.dataPulse.label}
                </div>
              )}

              {(!snapshot.webcamOptIn || !previewReady) && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-8">
                  <div className="max-w-sm rounded-full px-5 py-3 text-center text-xs font-medium" style={hudPillStyle}>
                    {!snapshot.webcamOptIn
                      ? 'Enable webcam sensing in the main app to unlock preview here.'
                      : snapshot.webcamState === 'blocked'
                        ? WEBCAM_UNAVAILABLE_MESSAGE
                        : 'Waiting for the main camera view to warm up.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
