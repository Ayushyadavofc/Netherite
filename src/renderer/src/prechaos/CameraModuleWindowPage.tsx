import { Camera, Clock3, Pause, Play, TimerReset, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { preChaosBridge } from './bridge'
import type { CameraModuleMode, CameraModuleSnapshot, WebcamPoint } from './types'
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
type Callout = {
  id: string
  label: string
  value: string
  align: 'left' | 'right' | 'bottom'
  controls?: 'timer'
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
  side: HUDSide
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
  updatedAt: Date.now()
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount
const formatPercent = (value: number) => `${Math.round(value * 100)}%`
const mirrorPoint = (point: WebcamPoint): Point => ({ x: 1 - point.x, y: point.y })
const toDisplayFaceBox = (faceBox: CameraModuleSnapshot['webcamMetrics']['face_box']): FaceBox | null =>
  faceBox ? { x: 1 - faceBox.x - faceBox.width, y: faceBox.y, width: faceBox.width, height: faceBox.height } : null

const formatStopwatch = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

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
  snapshot: { anchor: 'leftTemple', side: 'left' },
  blink: { anchor: 'eyeMid', side: 'left' },
  'face-lock': { anchor: 'noseTip', side: 'left' },
  motion: { anchor: 'chin', side: 'left' },
  fatigue: { anchor: 'forehead', side: 'right' },
  lighting: { anchor: 'leftCheek', side: 'right' },
  confidence: { anchor: 'rightCheek', side: 'right' },
  webcam: { anchor: 'rightCheek', side: 'right' },
  sidecar: { anchor: 'rightJaw', side: 'right' }
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
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(true)
  const [memoryWheelEnabled, setMemoryWheelEnabled] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [hudTheme, setHudTheme] = useState<HUDTheme>(() => readHUDTheme())
  const [flowLines, setFlowLines] = useState<Record<string, FlowLine>>({})
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const connectorStateRef = useRef<Record<string, { start: Point; end: Point }>>({})

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
    const node = hostRef.current
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
    if (!isStopwatchRunning) return
    const timer = window.setInterval(() => setElapsedMs((current) => current + 1000), 1000)
    return () => window.clearInterval(timer)
  }, [isStopwatchRunning])

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

  const callouts = useMemo<Callout[]>(() => {
    return [
      {
        id: 'snapshot',
        label: 'Live Snapshot',
        value: `${Math.round((snapshot.prediction?.risk ?? 0) * 100)}% ${snapshot.prediction?.state ?? 'warming up'}`,
        align: 'left'
      },
      {
        id: 'blink',
        label: 'Blink Count',
        value: String(snapshot.webcamMetrics.blink_count),
        align: 'left'
      },
      {
        id: 'face-lock',
        label: 'Face Lock',
        value: formatPercent(snapshot.webcamMetrics.face_presence),
        align: 'left'
      },
      {
        id: 'motion',
        label: 'Motion',
        value: formatPercent(snapshot.webcamMetrics.movement),
        align: 'left'
      },
      {
        id: 'fatigue',
        label: 'Fatigue',
        value: `${formatPercent(snapshot.fatigueScore)} ${snapshot.webcamMetrics.fatigue_status.toLowerCase()}`,
        align: 'right'
      },
      {
        id: 'lighting',
        label: 'Lighting',
        value: snapshot.webcamMetrics.low_light ? 'Low' : 'Balanced',
        align: 'right'
      },
      {
        id: 'confidence',
        label: 'Confidence',
        value: `${confidencePercent}% lock`,
        align: 'right'
      },
      {
        id: 'webcam',
        label: 'Webcam',
        value: snapshot.webcamState,
        align: 'right'
      },
      {
        id: 'sidecar',
        label: 'Sidecar',
        value: snapshot.sidecarState,
        align: 'right'
      },
      {
        id: 'timer',
        label: 'Timer',
        value: formatStopwatch(elapsedMs),
        align: 'bottom',
        controls: 'timer'
      }
    ]
  }, [confidencePercent, elapsedMs, snapshot.fatigueScore, snapshot.prediction?.risk, snapshot.prediction?.state, snapshot.sidecarState, snapshot.webcamMetrics.blink_count, snapshot.webcamMetrics.face_presence, snapshot.webcamMetrics.fatigue_status, snapshot.webcamMetrics.low_light, snapshot.webcamMetrics.movement, snapshot.webcamState])

  const leftCallouts = callouts.filter((callout) => callout.align === 'left')
  const rightCallouts = callouts.filter((callout) => callout.align === 'right')
  const timerCallout = callouts.find((callout) => callout.align === 'bottom') ?? null
  const connectedCallouts = callouts.filter(
    (callout): callout is Callout & { id: HUDConnectionMetricId } =>
      Object.prototype.hasOwnProperty.call(HUD_CONNECTION_CONFIG, callout.id)
  )
  const hudCardStyle = useMemo<CSSProperties>(
    () => ({
      width: 'fit-content',
      minWidth: 140,
      maxWidth: 220,
      padding: '10px 12px',
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

  const isInCameraMode = snapshot.mode === 'expanded'
  const prevModeRef = useRef(snapshot.mode)

  useEffect(() => {
    if (prevModeRef.current === 'expanded' && snapshot.mode !== 'expanded') {
      connectorStateRef.current = {}
      setFlowLines({})
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

      const getPanelAnchor = (callout: Callout): Point | null => {
        const panel = panelRefs.current[callout.id]
        if (!panel) return null

        const rect = panel.getBoundingClientRect()
        if (callout.align === 'left') {
          return { x: rect.right - hostRect.left + 14, y: rect.top - hostRect.top + rect.height / 2 }
        }
        if (callout.align === 'right') {
          return { x: rect.left - hostRect.left - 14, y: rect.top - hostRect.top + rect.height / 2 }
        }
        return { x: rect.left - hostRect.left + rect.width / 2, y: rect.top - hostRect.top - 12 }
      }

      const nextFlowLines: Record<string, FlowLine> = {}
      const activeIds = new Set<string>()

      for (const callout of connectedCallouts) {
        const panelAnchor = getPanelAnchor(callout)
        if (!panelAnchor) continue

        const connection = HUD_CONNECTION_CONFIG[callout.id]
        activeIds.add(callout.id)
        const faceAnchor = toPixel(hudAnchors[connection.anchor])
        const previous = connectorStateRef.current[callout.id] ?? { start: panelAnchor, end: faceAnchor }

        previous.start = {
          x: lerp(previous.start.x, panelAnchor.x, 0.16),
          y: lerp(previous.start.y, panelAnchor.y, 0.16)
        }
        previous.end = {
          x: lerp(previous.end.x, faceAnchor.x, 0.22),
          y: lerp(previous.end.y, faceAnchor.y, 0.22)
        }

        connectorStateRef.current[callout.id] = previous
        nextFlowLines[callout.id] = getHUDPath(previous.start, previous.end, connection.side)
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
  }, [connectedCallouts, hasTrackedFace, hudAnchors, viewport.height, viewport.width, snapshot.mode])

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

  const handleModeChange = async (mode: CameraModuleMode) => setSnapshot(await preChaosBridge.setCameraModuleMode(mode))

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
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setIsStopwatchRunning((current) => !current)}
            onDoubleClick={() => setElapsedMs(0)}
            className="text-4xl font-black tabular-nums tracking-tight text-[var(--nv-secondary)]"
            style={{ textShadow: `0 0 18px ${hudTheme.primaryGlow}` }}
          >
            {formatStopwatch(elapsedMs)}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsStopwatchRunning((current) => !current)}
              className="rounded-full border p-2"
              style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
            >
              {isStopwatchRunning ? (
                <Pause className="h-3.5 w-3.5 text-[var(--nv-primary)]" />
              ) : (
                <Play className="h-3.5 w-3.5 text-[var(--nv-primary)]" />
              )}
            </button>
            <button type="button" onClick={() => setElapsedMs(0)} className="rounded-full border p-2" style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}>
              <TimerReset className="h-3.5 w-3.5 text-[var(--nv-primary)]" />
            </button>
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
              <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between text-[10px] font-bold uppercase tracking-[0.28em]">
                <div className="rounded-full px-3 py-1.5" style={hudPillStyle}>
                  {snapshot.webcamMetrics.face_detected ? 'Face tracked' : snapshot.webcamState}
                </div>
                <div className="rounded-full px-3 py-1.5" style={hudPillStyle}>
                  Updated {updatedAtLabel}
                </div>
              </div>

              <div className="pointer-events-none absolute left-5 top-24 flex flex-col items-start gap-4">
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

              <div className="pointer-events-none absolute right-5 top-24 flex flex-col items-end gap-4">
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

              {timerCallout && (
                <div className="absolute bottom-5 left-5 select-none" style={{ animation: 'jarvisPulse 3.2s ease-in-out infinite' }}>
                  <div
                    ref={(node) => {
                      panelRefs.current[timerCallout.id] = node
                    }}
                    style={{
                      ...hudCardStyle,
                      minWidth: 140,
                      maxWidth: 180,
                      padding: '10px 12px'
                    }}
                  >
                    <div className="text-center text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: hudTheme.foreground, opacity: 0.98 }}>
                      {timerCallout.label}
                    </div>
                    <div className="mx-auto mt-2 h-px w-12" style={{ background: `linear-gradient(90deg, transparent, ${hudTheme.primary}, transparent)` }} />
                    <div className="mt-1 text-center text-base font-black leading-none" style={{ color: hudTheme.foreground, textShadow: `0 0 16px ${hudTheme.primaryGlow}` }}>
                      {timerCallout.value}
                    </div>
                    <div className="pointer-events-auto mt-2 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsStopwatchRunning((current) => !current)}
                        className="rounded-full border p-1"
                        style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                      >
                        {isStopwatchRunning ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setElapsedMs(0)}
                        className="rounded-full border p-1"
                        style={{ borderColor: hudTheme.primaryGlow, color: hudTheme.primary }}
                      >
                        <TimerReset className="h-2.5 w-2.5" />
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
                        : 'Waiting for the main AI camera stream to warm up.'}
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
