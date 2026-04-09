import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'
import type { WebcamMetrics } from './types'
import {
  WEBCAM_NEUTRAL_FATIGUE_SCORE,
  WEBCAM_UNAVAILABLE_MESSAGE,
  WEBCAM_WARMUP_TIMEOUT_MS
} from './webcam-status'
import {
  type Landmark,
  type FaceMeshResults,
  clamp,
  distance,
  normalizePoint,
  averageLandmark,
  computeEAR,
  isSmiling,
  getHeadPose,
  getMouthOpening,
  pickPoints,
  EAR_THRESHOLD,
  CONSEC_FRAMES,
  PERCLOS_WINDOW_MS,
  PERCLOS_THRESHOLD,
  HEAD_POSE_YAW_THRESHOLD,
  HEAD_POSE_PITCH_THRESHOLD,
  YAWN_MOUTH_OPENING_THRESHOLD,
  YAWN_SUSTAINED_MS,
  FATIGUE_RISE_ALPHA,
  FATIGUE_FALL_ALPHA,
  SMILE_WIDTH_THRESHOLD,
  BLINK_THRESHOLD,
  MEDIAPIPE_VERSION,
  EAR_SMOOTHING_WINDOW_CONTROLLER,
  BLINK_RESET_FRAMES_CONTROLLER,
  LEFT_EYE_EAR,
  RIGHT_EYE_EAR,
  LEFT_EYE_OUTLINE,
  RIGHT_EYE_OUTLINE,
  FACE_OVAL,
  NOSE_TIP,
  NOSE_TIP_FALLBACK,
  MOUTH_CENTER_UPPER,
  MOUTH_CENTER_LOWER,
  MOUTH_UPPER_LIP,
  MOUTH_LOWER_LIP,
  MOUTH_CORNER_LEFT,
  MOUTH_CORNER_RIGHT,
} from './faceAnalysis'

const getCurrentRoute = () => window.location.hash.replace(/^#/, '') || '/'
const describeInitFailure = (error: unknown) => {
  if (error instanceof DOMException) {
    return error.message ? `${error.name}: ${error.message}` : error.name
  }
  if (error instanceof Error) {
    return error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message
  }
  return String(error)
}

type FaceMeshInstance = {
  setOptions: (options: Record<string, unknown>) => void
  onResults: (callback: (results: FaceMeshResults) => void) => void
  send: (payload: { image: HTMLVideoElement }) => Promise<void>
  initialize?: () => Promise<void>
  close?: () => void
}

declare global {
  interface Window {
    FaceMesh?: new (config: { locateFile: (file: string) => string }) => FaceMeshInstance
  }
}

const RECOVERY_DELAY_MS = 2000
const METRIC_EMIT_MS = 180
const PREVIEW_EMIT_MS = 450
const FATIGUE_EMIT_MS = 180
const getMediaPipeAssetUrl = (file: string) =>
  `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}/${file}`
const MEDIAPIPE_SCRIPT_URL = getMediaPipeAssetUrl('face_mesh.js')
const MAX_CONSECUTIVE_FRAME_FAILURES = 12
const FRAME_FAILURE_RESET_MS = 15_000
const MAX_RECOVERY_ATTEMPTS = 3

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
  head_pose: 'center',
  perclos: 0,
  yawn_detected: false,
  fatigue_status: 'No face',
  webcam_risk: 0,
  webcam_state: 'No face',
  notes_risk: 0,
  notes_state: 'No notes',
  face_box: null
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset.ready === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.addEventListener(
      'load',
      () => {
        script.dataset.ready = 'true'
        resolve()
      },
      { once: true }
    )
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
    document.head.appendChild(script)
  })

const waitForVideoReady = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }

    const cleanup = () => {
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Camera stream did not become ready'))
    }

    video.addEventListener('canplay', onReady, { once: true })
    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })

class WebcamController {
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private faceMesh: FaceMeshInstance | null = null
  private frameCanvas: HTMLCanvasElement | null = null
  private lightCanvas: HTMLCanvasElement | null = null
  private animationFrame: number | null = null
  private keepAliveTimer: number | null = null
  private restartTimer: number | null = null
  private processing = false
  private enabled = false
  private starting: Promise<void> | null = null
  private recovering = false
  private lowEarFrameCount = 0
  private blinkCount = 0
  private blinkActive = false
  private lastBlinkAt = 0
  private earSamples: number[] = []
  private eyeClosureHistory: Array<{ timestamp: number; closed: boolean }> = []
  private yawnStartedAt: number | null = null
  private previousFaceCenter: { x: number; y: number } | null = null
  private lastFatigueStatus: 'Alert' | 'Drowsy' | 'No face' = 'No face'
  private webcamRisk = 0
  private lastMetricEmitAt = 0
  private lastPreviewEmitAt = 0
  private lastFatigueEmitAt = 0
  private cachedPreviewFrame: string | undefined = undefined
  private warmupTimer: number | null = null
  private resolveWarmup: (() => void) | null = null
  private rejectWarmup: ((error: Error) => void) | null = null
  private consecutiveFrameFailures = 0
  private lastFrameFailureAt = 0
  private recoveryAttemptCount = 0

  start() {
    this.enabled = true
    if (this.faceMesh && this.stream && this.video) {
      return Promise.resolve()
    }
    if (this.starting) {
      return this.starting
    }
    this.starting = this.boot(false).finally(() => {
      this.starting = null
    })
    return this.starting
  }

  stop() {
    this.enabled = false
    this.clearRuntime()
    this.resetMetrics('disabled')
  }

  private get store() {
    return usePreChaosStore.getState()
  }

  private resetMetrics(state: 'disabled' | 'blocked' = 'disabled', fatigueScore = 0) {
    this.lowEarFrameCount = 0
    this.blinkCount = 0
    this.blinkActive = false
    this.lastBlinkAt = 0
    this.earSamples = []
    this.eyeClosureHistory = []
    this.yawnStartedAt = null
    this.previousFaceCenter = null
    this.lastFatigueStatus = 'No face'
    this.webcamRisk = 0
    this.lastMetricEmitAt = 0
    this.lastPreviewEmitAt = 0
    this.lastFatigueEmitAt = 0
    this.cachedPreviewFrame = undefined
    this.consecutiveFrameFailures = 0
    this.lastFrameFailureAt = 0
    this.store.setWebcamEnabled(state !== 'disabled')
    this.store.setWebcamState(state)
    this.store.setWebcamStream(null)
    this.store.setFatigueScore(fatigueScore)
    this.store.setWebcamMetrics(defaultWebcamMetrics)
  }

  private clearRuntime() {
    this.detachWarmupGuards()
    this.rejectWarmup?.(new Error('Webcam initialization interrupted'))
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.faceMesh?.close?.()
    this.faceMesh = null
    this.stream?.getTracks().forEach((track) => {
      track.onended = null
      track.onmute = null
      track.onunmute = null
      track.stop()
    })
    this.stream = null
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
    }
    this.video = null
    this.frameCanvas = null
    this.lightCanvas = null
    this.processing = false
    this.consecutiveFrameFailures = 0
    this.lastFrameFailureAt = 0
  }

  private isWarmingUp() {
    return this.resolveWarmup !== null
  }

  private isMediaPipeWarmupFailure(reason: string) {
    const normalized = reason.toLowerCase()
    return (
      normalized.includes('@mediapipe') ||
      normalized.includes('mediapipe') ||
      normalized.includes('face_mesh') ||
      normalized.includes('face mesh') ||
      normalized.includes('assets_loader') ||
      normalized.includes('solution_packed_assets_loader') ||
      normalized.includes('face_mesh_solution')
    )
  }

  private attachWarmupGuards() {
    window.addEventListener('error', this.handleWarmupWindowError)
    window.addEventListener('unhandledrejection', this.handleWarmupUnhandledRejection)
  }

  private detachWarmupGuards() {
    window.removeEventListener('error', this.handleWarmupWindowError)
    window.removeEventListener('unhandledrejection', this.handleWarmupUnhandledRejection)
  }

  private handleWarmupWindowError = (event: ErrorEvent) => {
    if (!this.enabled || !this.resolveWarmup) {
      return
    }

    const reason = [event.message, event.filename, describeInitFailure(event.error)]
      .filter((value) => Boolean(value))
      .join(' | ')

    if (!reason || !this.isMediaPipeWarmupFailure(reason)) {
      return
    }

    event.preventDefault()
    this.rejectWarmup?.(new Error(reason))
  }

  private handleWarmupUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!this.enabled || !this.resolveWarmup) {
      return
    }

    const reason = describeInitFailure(event.reason)
    if (!reason || !this.isMediaPipeWarmupFailure(reason)) {
      return
    }

    event.preventDefault()
    this.rejectWarmup?.(new Error(reason))
  }

  private waitForWarmup() {
    if (this.warmupTimer !== null) {
      window.clearTimeout(this.warmupTimer)
      this.warmupTimer = null
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false
      this.attachWarmupGuards()
      const finish = (callback: () => void) => {
        if (settled) {
          return
        }
        settled = true
        this.detachWarmupGuards()
        if (this.warmupTimer !== null) {
          window.clearTimeout(this.warmupTimer)
          this.warmupTimer = null
        }
        this.resolveWarmup = null
        this.rejectWarmup = null
        callback()
      }

      this.resolveWarmup = () => finish(resolve)
      this.rejectWarmup = (error: Error) => finish(() => reject(error))
      this.warmupTimer = window.setTimeout(() => {
        this.rejectWarmup?.(
          new Error(`MediaPipe FaceMesh warm-up timed out after ${WEBCAM_WARMUP_TIMEOUT_MS / 1000} seconds`)
        )
      }, WEBCAM_WARMUP_TIMEOUT_MS)
    })
  }

  private handleInitializationFailure(error: unknown) {
    const reason = describeInitFailure(error)
    this.clearRuntime()
    this.recovering = false
    this.store.setWebcamRecovering(false)
    this.resetMetrics('blocked', WEBCAM_NEUTRAL_FATIGUE_SCORE)
    this.store.logEvent({
      type: 'webcam',
      label: WEBCAM_UNAVAILABLE_MESSAGE,
      route: getCurrentRoute(),
      importance: 'high',
      collectible: false
    })
    void preChaosBridge.log(`Webcam/model init failed: ${reason}`)
  }

  private scheduleRecovery(reason: string) {
    if (!this.enabled || this.recovering) {
      return
    }
    if (this.recoveryAttemptCount >= MAX_RECOVERY_ATTEMPTS) {
      this.store.logEvent({
        type: 'webcam',
        label: 'Max recovery attempts reached, continuing with degraded state',
        route: getCurrentRoute(),
        importance: 'medium',
        collectible: false
      })
      this.consecutiveFrameFailures = 0
      this.lastFrameFailureAt = 0
      this.recovering = false
      this.store.setWebcamRecovering(false)
      return
    }
    this.recovering = true
    this.store.setWebcamRecovering(true)
    this.recoveryAttemptCount += 1
    this.store.setWebcamState('requesting')
    this.store.logEvent({ type: 'webcam', label: reason, route: getCurrentRoute(), importance: 'medium', collectible: false })
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer)
    }
    const delay = RECOVERY_DELAY_MS * Math.pow(2, this.recoveryAttemptCount - 1)
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null
      this.clearRuntime()
      this.starting = this.boot(true).finally(() => {
        this.starting = null
      })
    }, delay)
  }

  private movingAverage(value: number) {
    this.earSamples.push(value)
    if (this.earSamples.length > EAR_SMOOTHING_WINDOW_CONTROLLER) {
      this.earSamples.shift()
    }
    const total = this.earSamples.reduce((sum, sample) => sum + sample, 0)
    return total / Math.max(this.earSamples.length, 1)
  }

  private updatePerclos(now: number, closed: boolean) {
    this.eyeClosureHistory.push({ timestamp: now, closed })
    const cutoff = now - PERCLOS_WINDOW_MS
    while (this.eyeClosureHistory.length > 1 && this.eyeClosureHistory[1].timestamp <= cutoff) {
      this.eyeClosureHistory.shift()
    }

    if (this.eyeClosureHistory.length === 0) {
      return 0
    }

    const observedStart = Math.max(cutoff, this.eyeClosureHistory[0].timestamp)
    const windowSpan = now - observedStart
    if (windowSpan <= 0) {
      return closed ? 1 : 0
    }

    let closedMs = 0
    for (let index = 0; index < this.eyeClosureHistory.length - 1; index += 1) {
      const current = this.eyeClosureHistory[index]
      const next = this.eyeClosureHistory[index + 1]
      if (!current.closed) {
        continue
      }
      closedMs += Math.max(0, next.timestamp - Math.max(current.timestamp, cutoff))
    }

    const lastSample = this.eyeClosureHistory[this.eyeClosureHistory.length - 1]
    if (lastSample?.closed) {
      closedMs += Math.max(0, now - Math.max(lastSample.timestamp, cutoff))
    }

    return clamp(closedMs / windowSpan)
  }

  private emitFatigue(score: number) {
    const now = performance.now()
    if (now - this.lastFatigueEmitAt < FATIGUE_EMIT_MS) {
      return
    }
    this.lastFatigueEmitAt = now
    this.store.setFatigueScore(Number(score.toFixed(4)))
  }

  private emitMetrics(metrics: Partial<WebcamMetrics>) {
    const now = performance.now()
    const nextMetrics = { ...metrics }
    if ('preview_frame' in nextMetrics) {
      if (now - this.lastPreviewEmitAt >= PREVIEW_EMIT_MS) {
        this.lastPreviewEmitAt = now
        this.cachedPreviewFrame = nextMetrics.preview_frame
      } else {
        nextMetrics.preview_frame = this.cachedPreviewFrame
      }
    }
    if (now - this.lastMetricEmitAt < METRIC_EMIT_MS) {
      return
    }
    this.lastMetricEmitAt = now
    this.store.setWebcamMetrics(nextMetrics)
  }

  private capturePreviewFrame() {
    if (!this.video || !this.frameCanvas || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      return undefined
    }
    this.frameCanvas.width = this.video.videoWidth
    this.frameCanvas.height = this.video.videoHeight
    const ctx = this.frameCanvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(this.video, 0, 0, this.frameCanvas.width, this.frameCanvas.height)
    return this.frameCanvas.toDataURL('image/jpeg', 0.72)
  }

  private computeBrightness() {
    if (!this.video || !this.lightCanvas || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      return 0
    }
    this.lightCanvas.width = 64
    this.lightCanvas.height = 48
    const ctx = this.lightCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return 0
    ctx.drawImage(this.video, 0, 0, this.lightCanvas.width, this.lightCanvas.height)
    const { data } = ctx.getImageData(0, 0, this.lightCanvas.width, this.lightCanvas.height)
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      total += (data[i] + data[i + 1] + data[i + 2]) / 3
    }
    return total / Math.max(data.length / 4, 1)
  }

  private handleResults = (results: FaceMeshResults) => {
    if (!this.enabled || !this.video || !this.faceMesh) {
      this.processing = false
      return
    }

    this.consecutiveFrameFailures = 0
    this.lastFrameFailureAt = 0
    this.resolveWarmup?.()
    this.processing = false
    const brightness = this.computeBrightness()
    const lighting = clamp(brightness / 255)
    const lowLight = brightness > 0 && brightness < 65
    const previewFrame = this.capturePreviewFrame()
    const currentRoute = getCurrentRoute()

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      const ear = this.movingAverage(0)
      this.eyeClosureHistory = []
      this.yawnStartedAt = null
      if (this.lastFatigueStatus !== 'No face') {
        this.store.logEvent({ type: 'webcam', label: 'Face moved out of frame', route: currentRoute, importance: 'low', collectible: false })
        this.lastFatigueStatus = 'No face'
      }
      this.webcamRisk = clamp(this.webcamRisk * 0.992)
      this.emitFatigue(this.webcamRisk)
      this.store.setWebcamState(this.recovering ? 'requesting' : 'active')
      this.emitMetrics({
        face_presence: 0,
        blink_intensity: 0,
        movement: 0,
        lighting: Number(lighting.toFixed(4)),
        confidence: 0,
        preview_frame: previewFrame,
        left_eye_blink: 0,
        right_eye_blink: 0,
        face_landmarks: [],
        face_outline: [],
        left_eye_outline: [],
        right_eye_outline: [],
        ear: Number(ear.toFixed(3)),
        left_ear: 0,
        right_ear: 0,
        blink_count: this.blinkCount,
        low_light: lowLight,
        face_detected: false,
        head_pose: 'center',
        perclos: 0,
        yawn_detected: false,
        fatigue_status: 'No face',
        webcam_risk: Number(this.webcamRisk.toFixed(4)),
        webcam_state: 'No face',
        notes_risk: 0,
        notes_state: 'No notes',
        face_box: null
      })
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    const leftEar = computeEAR(landmarks, LEFT_EYE_EAR)
    const rightEar = computeEAR(landmarks, RIGHT_EYE_EAR)
    const averageEar = (leftEar + rightEar) / 2
    const smoothedEar = this.movingAverage(averageEar)

    if (smoothedEar < EAR_THRESHOLD) this.lowEarFrameCount += 1
    else this.lowEarFrameCount = 0

    const leftClosure = clamp((EAR_THRESHOLD - leftEar) / EAR_THRESHOLD)
    const rightClosure = clamp((EAR_THRESHOLD - rightEar) / EAR_THRESHOLD)
    const blinkIntensity = clamp((leftClosure + rightClosure) / 2)
    const now = performance.now()
    if (!this.blinkActive && smoothedEar < BLINK_THRESHOLD && now - this.lastBlinkAt > BLINK_RESET_FRAMES_CONTROLLER) {
      this.blinkCount += 1
      this.blinkActive = true
      this.lastBlinkAt = now
    } else if (this.blinkActive && smoothedEar > BLINK_THRESHOLD + 0.035) {
      this.blinkActive = false
    }

    const xs = landmarks.map((point) => point.x)
    const ys = landmarks.map((point) => point.y)
    const minX = clamp(Math.min(...xs))
    const maxX = clamp(Math.max(...xs))
    const minY = clamp(Math.min(...ys))
    const maxY = clamp(Math.max(...ys))
    const faceWidth = Math.max(maxX - minX, 0.0001)
    const faceHeight = Math.max(maxY - minY, 0.0001)
    const faceCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    const movementRaw = this.previousFaceCenter
      ? Math.hypot(faceCenter.x - this.previousFaceCenter.x, faceCenter.y - this.previousFaceCenter.y) * 10
      : 0
    this.previousFaceCenter = faceCenter
    const movement = clamp(movementRaw)
    const smiling = isSmiling(landmarks, faceWidth)
    const perclos = this.updatePerclos(now, smoothedEar < EAR_THRESHOLD)
    const headPose = getHeadPose(landmarks, faceWidth, faceHeight)
    const mouthOpening = getMouthOpening(landmarks, faceHeight)
    if (mouthOpening >= YAWN_MOUTH_OPENING_THRESHOLD) {
      this.yawnStartedAt ??= now
    } else {
      this.yawnStartedAt = null
    }
    const yawnDetected = this.yawnStartedAt !== null && now - this.yawnStartedAt >= YAWN_SUSTAINED_MS

    const eyesClosedForLong = this.lowEarFrameCount >= CONSEC_FRAMES
    const drowsy = eyesClosedForLong || perclos >= PERCLOS_THRESHOLD || yawnDetected
    const sustainedClosure = clamp((EAR_THRESHOLD - smoothedEar) / EAR_THRESHOLD)
    const lowEarPressure = clamp(this.lowEarFrameCount / CONSEC_FRAMES)
    const movementPenalty = clamp((movement - 0.28) / 0.45)
    const lightingPenalty = lowLight ? 0.08 : 0
    const blinkPenalty = blinkIntensity > 0.72 ? (blinkIntensity - 0.72) * 0.08 : 0
    const perclosPenalty =
      perclos > PERCLOS_THRESHOLD ? clamp(((perclos - PERCLOS_THRESHOLD) / (1 - PERCLOS_THRESHOLD)) * 0.24, 0, 0.24) : 0
    const yawnPenalty = yawnDetected ? 0.12 : 0
    const rawRisk = clamp(
      sustainedClosure * 0.52 +
        lowEarPressure * 0.24 +
        movementPenalty * 0.08 +
        blinkPenalty +
        lightingPenalty +
        perclosPenalty +
        yawnPenalty,
      0,
      1
    )
    const adjustedRisk = clamp(smiling ? rawRisk * 0.4 : rawRisk, 0, 1)
    const fatigueFloor = perclos >= PERCLOS_THRESHOLD ? 0.62 : yawnDetected ? 0.56 : 0.58
    const fatigueTarget = drowsy ? Math.max(adjustedRisk, fatigueFloor) : Math.min(adjustedRisk, 0.5)
    const fatigueAlpha = fatigueTarget > this.webcamRisk ? FATIGUE_RISE_ALPHA : FATIGUE_FALL_ALPHA
    const fatigueScore = clamp(this.webcamRisk + (fatigueTarget - this.webcamRisk) * fatigueAlpha, 0, drowsy ? 1 : 0.5)
    this.webcamRisk = fatigueScore
    const confidence = clamp(0.55 + (1 - Math.abs(leftEar - rightEar)) * 0.25 - (lowLight ? 0.12 : 0))
    const webcamState = fatigueScore < 0.33 ? 'Stable' : fatigueScore < 0.66 ? 'Watch' : 'Elevated'

    this.emitFatigue(fatigueScore)
    this.recovering = false
    this.store.setWebcamRecovering(false)
    this.store.setWebcamState('active')
    this.emitMetrics({
      face_presence: 1,
      blink_intensity: Number(blinkIntensity.toFixed(4)),
      movement: Number(movement.toFixed(4)),
      lighting: Number(lighting.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      preview_frame: previewFrame,
      left_eye_blink: Number(leftClosure.toFixed(4)),
      right_eye_blink: Number(rightClosure.toFixed(4)),
      face_landmarks: landmarks.map((point) => normalizePoint(point)),
      face_outline: pickPoints(landmarks, FACE_OVAL),
      left_eye_outline: pickPoints(landmarks, LEFT_EYE_OUTLINE),
      right_eye_outline: pickPoints(landmarks, RIGHT_EYE_OUTLINE),
      ear: Number(smoothedEar.toFixed(3)),
      left_ear: Number(leftEar.toFixed(3)),
      right_ear: Number(rightEar.toFixed(3)),
      blink_count: this.blinkCount,
      low_light: lowLight,
      face_detected: true,
      head_pose: headPose,
      perclos: Number(perclos.toFixed(4)),
      yawn_detected: yawnDetected,
      fatigue_status: drowsy ? 'Drowsy' : 'Alert',
      webcam_risk: Number(fatigueScore.toFixed(4)),
      webcam_state: webcamState,
      notes_risk: 0,
      notes_state: 'No notes',
      face_box: {
        x: Number(minX.toFixed(4)),
        y: Number(minY.toFixed(4)),
        width: Number((maxX - minX).toFixed(4)),
        height: Number((maxY - minY).toFixed(4))
      }
    })

    const nextStatus = drowsy ? 'Drowsy' : 'Alert'
    if (this.lastFatigueStatus !== nextStatus) {
      this.store.logEvent({
        type: 'webcam',
        label: drowsy ? 'EAR stayed low: fatigue risk rising' : `Face tracked with EAR ${smoothedEar.toFixed(3)}`,
        route: currentRoute,
        importance: drowsy ? 'high' : 'low',
        collectible: false
      })
      this.lastFatigueStatus = nextStatus
    }
  }

  private loop = async () => {
    if (!this.enabled) return
    try {
      if (this.video && this.faceMesh && this.video.readyState >= 2 && !this.processing) {
        this.processing = true
        await this.faceMesh.send({ image: this.video })
      }
    } catch (error) {
      this.processing = false
      if (this.isWarmingUp()) {
        this.rejectWarmup?.(
          error instanceof Error ? error : new Error(`MediaPipe FaceMesh warm-up failed: ${String(error)}`)
        )
        return
      }

      const now = performance.now()
      if (now - this.lastFrameFailureAt > FRAME_FAILURE_RESET_MS) {
        this.consecutiveFrameFailures = 0
      }
      this.lastFrameFailureAt = now
      this.consecutiveFrameFailures += 1

      if (this.video?.paused) {
        void this.video.play().catch(() => undefined)
      }

      if (this.consecutiveFrameFailures >= MAX_CONSECUTIVE_FRAME_FAILURES) {
        this.scheduleRecovery(
          `Webcam frame stalled, recovering after ${this.consecutiveFrameFailures} failures: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
    this.animationFrame = window.requestAnimationFrame(() => {
      void this.loop()
    })
  }

  private async boot(isRecovery: boolean) {
    try {
      this.store.setWebcamState('requesting')
      await loadScript(MEDIAPIPE_SCRIPT_URL)
      if (!window.FaceMesh) {
        throw new Error('MediaPipe FaceMesh unavailable')
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })

      const video = document.createElement('video')
      video.setAttribute('data-prechaos-mediapipe-processor', 'true')
      video.style.position = 'fixed'
      video.style.left = '-9999px'
      video.style.top = '-9999px'
      video.style.width = '640px'
      video.style.height = '480px'
      video.style.opacity = '0'
      video.style.pointerEvents = 'none'
      video.autoplay = true
      video.muted = true
      video.playsInline = true
      video.srcObject = this.stream
      document.body.appendChild(video)
      this.video = video
      this.frameCanvas = document.createElement('canvas')
      this.lightCanvas = document.createElement('canvas')
      await video.play()
      await waitForVideoReady(video)

      this.faceMesh = new window.FaceMesh({
        locateFile: (file) => getMediaPipeAssetUrl(file)
      })
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      this.faceMesh.onResults(this.handleResults)
      await this.faceMesh.initialize?.()

      const track = this.stream.getVideoTracks()[0]
      if (track) {
        track.contentHint = 'motion'
        track.onended = () => this.scheduleRecovery('Camera track ended, recovering webcam')
        track.onmute = () => {
          if (this.enabled) this.store.setWebcamState('requesting')
        }
        track.onunmute = () => {
          if (this.enabled) this.store.setWebcamState('active')
        }
      }

      this.store.setWebcamStream(this.stream)
      this.keepAliveTimer = window.setInterval(() => {
        const trackEl = this.stream?.getVideoTracks?.()[0]
        if (!this.video || !trackEl || trackEl.readyState !== 'live') {
          return
        }
        if (this.video.paused || this.video.readyState < 2) {
          void this.video.play().catch(() => undefined)
        }
      }, 1500)
      this.animationFrame = window.requestAnimationFrame(() => {
        void this.loop()
      })
      await this.waitForWarmup()
      this.store.setWebcamEnabled(true)
      this.recovering = false
      this.store.setWebcamRecovering(false)
      this.recoveryAttemptCount = 0
      if (this.store.webcamState === 'requesting') {
        this.store.setWebcamState('active')
      }
      this.store.logEvent({
        type: 'webcam',
        label: isRecovery ? 'MediaPipe FaceMesh webcam recovered' : 'MediaPipe FaceMesh webcam enabled',
        route: getCurrentRoute(),
        importance: 'medium',
        collectible: false
      })
    } catch (error) {
      if (!this.enabled) {
        return
      }
      this.handleInitializationFailure(error)
    }
  }
}

export const webcamController = new WebcamController()
