import type { WebcamMetrics, WebcamState } from './types'
import { usePreChaosStore } from './store'
import { WEBCAM_NEUTRAL_FATIGUE_SCORE, WEBCAM_WARMUP_TIMEOUT_MS } from './webcam-status'
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
  EAR_SMOOTHING_WINDOW_MESH,
  BLINK_RESET_FRAMES_MESH,
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

type FaceMeshInstance = {
  setOptions: (options: Record<string, unknown>) => void
  onResults: (callback: (results: FaceMeshResults) => void) => void
  send: (payload: { image: HTMLVideoElement }) => Promise<void>
  initialize?: () => Promise<void>
  close?: () => void
}

export type FaceTrackingSnapshot = {
  status: 'idle' | 'starting' | 'running' | 'paused' | 'error'
  webcamState: WebcamState
  fatigueScore: number
  metrics: WebcamMetrics
  stream: MediaStream | null
  modelLoaded: boolean
  error: string | null
  updatedAt: number
}

type FaceTrackingListener = (snapshot: FaceTrackingSnapshot) => void

declare global {
  interface Window {
    FaceMesh?: new (config: { locateFile: (file: string) => string }) => FaceMeshInstance
  }

  var __netheriteFaceMeshScriptPromise: Promise<void> | undefined
  var __netheriteFaceMeshService: FaceMeshService | undefined
}

const PROCESS_FPS_HIGH = 14
const PROCESS_FPS_LOW = 4
const PROCESS_FPS_HIGH_REDUCED = 10
const PROCESS_FPS_LOW_REDUCED = 3
const CAMERA_MODULE_EMIT_INTERVAL_MS = 80
const BACKGROUND_EMIT_INTERVAL_MS = 600
const CAMERA_MODULE_PREVIEW_CAPTURE_MS = 140
const HUD_PREVIEW_CAPTURE_MS = 280
const PREVIEW_MAX_WIDTH = 420
const IDLE_SHUTDOWN_MS = 5_000
const MAX_CONSECUTIVE_SEND_FAILURES = 8
const MAX_RECOVERY_ATTEMPTS = 4
const BASE_RECOVERY_DELAY_MS = 1_200

export const DEFAULT_WEBCAM_METRICS: WebcamMetrics = {
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

const describeError = (error: unknown) => {
  if (error instanceof DOMException) {
    return error.message ? `${error.name}: ${error.message}` : error.name
  }
  if (error instanceof Error) {
    return error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message
  }
  return String(error)
}

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

const getMediaPipeAssetUrl = (file: string) =>
  `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}/${file}`

const loadFaceMeshScriptOnce = () => {
  if (window.FaceMesh) {
    return Promise.resolve()
  }

  if (globalThis.__netheriteFaceMeshScriptPromise) {
    return globalThis.__netheriteFaceMeshScriptPromise
  }

  globalThis.__netheriteFaceMeshScriptPromise = new Promise<void>((resolve, reject) => {
    const src = getMediaPipeAssetUrl('face_mesh.js')
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
    script.dataset.faceMeshSingleton = 'true'
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

  return globalThis.__netheriteFaceMeshScriptPromise
}

class FaceMeshService {
  private listeners = new Set<FaceTrackingListener>()
  private consumerCount = 0
  private startPromise: Promise<void> | null = null
  private warmupPromise: Promise<void> | null = null
  private warmupResolve: (() => void) | null = null
  private warmupReject: ((error: Error) => void) | null = null
  private warmupTimer: number | null = null
  private shutdownTimer: number | null = null
  private restartTimer: number | null = null
  private animationFrame: number | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private faceMesh: FaceMeshInstance | null = null
  private previewCanvas: HTMLCanvasElement | null = null
  private lightingCanvas: HTMLCanvasElement | null = null
  private processingFrame = false
  private recoveryAttemptCount = 0
  private get isCameraModuleOpen(): boolean {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('prechaos-camera-module-open') === 'true'
  }
  private get isReducedMotionMode(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }
  private get processIntervalMs(): number {
    if (this.isCameraModuleOpen) {
      return 1000 / (this.isReducedMotionMode ? PROCESS_FPS_HIGH_REDUCED : PROCESS_FPS_HIGH)
    }
    return 1000 / (this.isReducedMotionMode ? PROCESS_FPS_LOW_REDUCED : PROCESS_FPS_LOW)
  }
  private lastProcessedAt = 0
  private lastEmittedAt = 0
  private lastPreviewAt = 0
  private frameCount = 0
  private consecutiveFrameFailures = 0
  private blinkCount = 0
  private blinkActive = false
  private lastBlinkAt = 0
  private lowEarFrameCount = 0
  private earSamples: number[] = []
  private eyeClosureHistory: Array<{ timestamp: number; closed: boolean }> = []
  private yawnStartedAt: number | null = null
  private previousFaceCenter: { x: number; y: number } | null = null
  private latestSnapshot: FaceTrackingSnapshot = {
    status: 'idle',
    webcamState: 'disabled',
    fatigueScore: 0,
    metrics: DEFAULT_WEBCAM_METRICS,
    stream: null,
    modelLoaded: false,
    error: null,
    updatedAt: Date.now()
  }

  subscribe = (listener: FaceTrackingListener) => {
    this.listeners.add(listener)
    listener(this.latestSnapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.latestSnapshot

  private visibilityHandler = () => {
    if (document.hidden) {
      if (this.animationFrame !== null) {
        window.cancelAnimationFrame(this.animationFrame)
        this.animationFrame = null
      }
    } else {
      if (this.consumerCount > 0 && this.faceMesh && this.video && this.stream) {
        this.startLoop()
      }
    }
  }

  acquire = () => {
    this.consumerCount += 1
    if (this.shutdownTimer !== null) {
      window.clearTimeout(this.shutdownTimer)
      this.shutdownTimer = null
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
    void this.ensureRunning()
    return () => {
      this.consumerCount = Math.max(0, this.consumerCount - 1)
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      if (this.consumerCount === 0) {
        this.scheduleShutdown()
      }
    }
  }

  private scheduleShutdown() {
    if (this.shutdownTimer !== null) {
      window.clearTimeout(this.shutdownTimer)
    }
    this.shutdownTimer = window.setTimeout(() => {
      this.shutdownTimer = null
      if (this.consumerCount === 0) {
        this.pause()
      }
    }, IDLE_SHUTDOWN_MS)
  }

  private emit(partial?: Partial<FaceTrackingSnapshot>) {
    this.latestSnapshot = {
      ...this.latestSnapshot,
      ...partial,
      updatedAt: Date.now()
    }

    Array.from(this.listeners).forEach((listener) => {
      listener(this.latestSnapshot)
    })
  }

  private clearWarmupState(error?: Error) {
    if (this.warmupTimer !== null) {
      window.clearTimeout(this.warmupTimer)
      this.warmupTimer = null
    }

    const reject = this.warmupReject
    this.warmupResolve = null
    this.warmupReject = null
    this.warmupPromise = null

    if (error && reject) {
      reject(error)
    }
  }

  private releaseResources(warmupError?: Error) {
    this.clearWarmupState(warmupError)

    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    this.processingFrame = false

    if (this.faceMesh) {
      this.faceMesh.close?.()
      this.faceMesh = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
    }
  }

  private resetMetrics(webcamState: WebcamState, fatigueScore = 0) {
    this.lowEarFrameCount = 0
    this.blinkCount = 0
    this.blinkActive = false
    this.lastBlinkAt = 0
    this.earSamples = []
    this.eyeClosureHistory = []
    this.yawnStartedAt = null
    this.previousFaceCenter = null
    this.consecutiveFrameFailures = 0
    this.emit({
      webcamState,
      fatigueScore,
      metrics: {
        ...DEFAULT_WEBCAM_METRICS
      }
    })
  }

  private movingAverage(value: number) {
    this.earSamples.push(value)
    if (this.earSamples.length > EAR_SMOOTHING_WINDOW_MESH) {
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

  private capturePreviewFrame() {
    if (!this.video || !this.previewCanvas || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      return this.latestSnapshot.metrics.preview_frame
    }

    const store = usePreChaosStore.getState()
    const cameraModuleOpen = window.localStorage.getItem('prechaos-camera-module-open') === 'true'
    const shouldCapturePreview = cameraModuleOpen || store.webcamPreviewVisible
    if (!shouldCapturePreview) {
      return undefined
    }

    const captureInterval = cameraModuleOpen ? CAMERA_MODULE_PREVIEW_CAPTURE_MS : HUD_PREVIEW_CAPTURE_MS
    const now = performance.now()
    if (now - this.lastPreviewAt < captureInterval) {
      return this.latestSnapshot.metrics.preview_frame
    }

    this.lastPreviewAt = now
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / this.video.videoWidth)
    this.previewCanvas.width = Math.max(1, Math.floor(this.video.videoWidth * scale))
    this.previewCanvas.height = Math.max(1, Math.floor(this.video.videoHeight * scale))
    const ctx = this.previewCanvas.getContext('2d')
    if (!ctx) {
      return this.latestSnapshot.metrics.preview_frame
    }

    ctx.drawImage(this.video, 0, 0, this.previewCanvas.width, this.previewCanvas.height)
    return this.previewCanvas.toDataURL('image/jpeg', cameraModuleOpen ? 0.58 : 0.5)
  }

  private computeBrightness() {
    if (!this.video || !this.lightingCanvas || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      return 0
    }

    this.lightingCanvas.width = 64
    this.lightingCanvas.height = 48
    const ctx = this.lightingCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return 0
    }

    ctx.drawImage(this.video, 0, 0, this.lightingCanvas.width, this.lightingCanvas.height)
    const { data } = ctx.getImageData(0, 0, this.lightingCanvas.width, this.lightingCanvas.height)
    let total = 0

    for (let index = 0; index < data.length; index += 4) {
      total += (data[index] + data[index + 1] + data[index + 2]) / 3
    }

    return total / Math.max(data.length / 4, 1)
  }

  private ensureWarmupPromise() {
    if (this.warmupPromise) {
      return this.warmupPromise
    }

    this.warmupPromise = new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) {
          return
        }
        settled = true
        if (this.warmupTimer !== null) {
          window.clearTimeout(this.warmupTimer)
          this.warmupTimer = null
        }
        this.warmupResolve = null
        this.warmupReject = null
        this.warmupPromise = null
        callback()
      }

      this.warmupResolve = () => finish(resolve)
      this.warmupReject = (error: Error) => finish(() => reject(error))

      this.warmupTimer = window.setTimeout(() => {
        this.warmupReject?.(new Error(`Face mesh warm-up timed out after ${WEBCAM_WARMUP_TIMEOUT_MS / 1000} seconds`))
      }, WEBCAM_WARMUP_TIMEOUT_MS)
    })

    return this.warmupPromise
  }

  private async ensureRunning() {
    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  private async startInternal() {
    this.emit({
      status: 'starting',
      webcamState: 'requesting',
      error: null
    })

    try {
      await loadFaceMeshScriptOnce()
      if (!window.FaceMesh) {
        throw new Error('MediaPipe FaceMesh did not register on window')
      }

      await this.ensureFaceMesh()
      await this.ensureVideoStream()
      this.startLoop()
      await this.ensureWarmupPromise()

      this.emit({
        status: 'running',
        webcamState: 'active',
        modelLoaded: true,
        stream: this.stream,
        error: null
      })
      this.recoveryAttemptCount = 0
    } catch (error) {
      this.releaseResources()
      this.resetMetrics('blocked', WEBCAM_NEUTRAL_FATIGUE_SCORE)
      this.emit({
        status: 'error',
        webcamState: 'blocked',
        fatigueScore: WEBCAM_NEUTRAL_FATIGUE_SCORE,
        stream: null,
        error: describeError(error)
      })
    }
  }

  private async ensureFaceMesh() {
    if (this.faceMesh) {
      return
    }

    this.faceMesh = new window.FaceMesh!({
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

    this.previewCanvas ??= document.createElement('canvas')
    this.lightingCanvas ??= document.createElement('canvas')

    this.emit({
      modelLoaded: true
    })
  }

  private async ensureVideoStream() {
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })

      const track = this.stream.getVideoTracks()[0]
      if (track) {
        track.contentHint = 'motion'
        track.onended = () => {
          this.scheduleRecovery('Camera track ended unexpectedly')
        }
      }
    }

    if (!this.video) {
      const video = document.createElement('video')
      video.setAttribute('data-netherite-face-mesh-video', 'true')
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
      document.body.appendChild(video)
      this.video = video
    }

    if (this.video.srcObject !== this.stream) {
      this.video.srcObject = this.stream
    }

    await this.video.play()
    await waitForVideoReady(this.video)

    this.emit({
      stream: this.stream
    })
  }

  private startLoop() {
    if (this.animationFrame !== null) {
      return
    }

    const tick = async (now: number) => {
      if (document.hidden) {
        this.animationFrame = null
        return
      }

      if (!this.faceMesh || !this.video || !this.stream) {
        this.animationFrame = null
        return
      }

      if (this.processingFrame || this.video.readyState < 2) {
        this.animationFrame = window.requestAnimationFrame(tick)
        return
      }

      if (now - this.lastProcessedAt < this.processIntervalMs) {
        this.animationFrame = window.requestAnimationFrame(tick)
        return
      }

      this.processingFrame = true
      this.lastProcessedAt = now

      try {
        await this.faceMesh.send({ image: this.video })
        this.consecutiveFrameFailures = 0
      } catch (error) {
        this.consecutiveFrameFailures += 1
        if (this.consecutiveFrameFailures >= MAX_CONSECUTIVE_SEND_FAILURES) {
          this.scheduleRecovery(`Frame processing failed repeatedly: ${describeError(error)}`)
        }
      } finally {
        this.processingFrame = false
        this.animationFrame = window.requestAnimationFrame(tick)
      }
    }

    this.animationFrame = window.requestAnimationFrame(tick)
  }

  private scheduleRecovery(reason: string) {
    if (this.consumerCount === 0) {
      this.pause()
      return
    }

    if (this.restartTimer !== null) {
      return
    }

    if (this.recoveryAttemptCount >= MAX_RECOVERY_ATTEMPTS) {
      this.releaseResources()
      this.resetMetrics('blocked', WEBCAM_NEUTRAL_FATIGUE_SCORE)
      this.emit({
        status: 'error',
        webcamState: 'blocked',
        fatigueScore: WEBCAM_NEUTRAL_FATIGUE_SCORE,
        stream: null,
        error: reason
      })
      return
    }

    this.recoveryAttemptCount += 1
    const delay = Math.min(6_000, BASE_RECOVERY_DELAY_MS * 2 ** (this.recoveryAttemptCount - 1))
    this.releaseResources(new Error('Face mesh recovery requested'))
    this.resetMetrics('requesting', WEBCAM_NEUTRAL_FATIGUE_SCORE)
    this.emit({
      status: 'starting',
      webcamState: 'requesting',
      fatigueScore: WEBCAM_NEUTRAL_FATIGUE_SCORE,
      stream: null,
      error: `${reason}. Retrying webcam startup...`
    })

    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null
      if (this.consumerCount > 0) {
        void this.ensureRunning()
      } else {
        this.pause()
      }
    }, delay)
  }

  private pause() {
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    this.recoveryAttemptCount = 0
    this.releaseResources(new Error('Face mesh paused'))
    this.resetMetrics('disabled')
    this.emit({
      status: 'paused',
      webcamState: 'disabled',
      stream: null
    })
  }

  private handleResults = (results: FaceMeshResults) => {
    this.warmupResolve?.()

    if (!this.video) {
      return
    }

    this.frameCount++
    const isBackgroundMode = !this.isCameraModuleOpen
    const shouldComputeLighting = !isBackgroundMode || this.frameCount % 4 === 0
    const brightness = shouldComputeLighting ? this.computeBrightness() : 0
    const lighting = clamp(brightness / 255)
    const lowLight = brightness > 0 && brightness < 65
    const previewFrame = this.capturePreviewFrame()

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      const ear = this.movingAverage(0)
      const nextRisk = clamp(this.latestSnapshot.metrics.webcam_risk * 0.992)
      this.eyeClosureHistory = []
      this.yawnStartedAt = null

      this.pushMetrics({
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
        webcam_risk: Number(nextRisk.toFixed(4)),
        webcam_state: 'No face',
        notes_risk: 0,
        notes_state: 'No notes',
        face_box: null
      }, nextRisk)
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    const leftEar = computeEAR(landmarks, LEFT_EYE_EAR)
    const rightEar = computeEAR(landmarks, RIGHT_EYE_EAR)
    const averageEar = (leftEar + rightEar) / 2
    const smoothedEar = this.movingAverage(averageEar)

    if (smoothedEar < EAR_THRESHOLD) {
      this.lowEarFrameCount += 1
    } else {
      this.lowEarFrameCount = 0
    }

    const leftClosure = clamp((EAR_THRESHOLD - leftEar) / EAR_THRESHOLD)
    const rightClosure = clamp((EAR_THRESHOLD - rightEar) / EAR_THRESHOLD)
    const blinkIntensity = clamp((leftClosure + rightClosure) / 2)
    const now = performance.now()
    const blinkDetectionEar = Math.min(smoothedEar, averageEar)
    const strongBlink = leftClosure > 0.72 || rightClosure > 0.72

    if (!this.blinkActive && (blinkDetectionEar < BLINK_THRESHOLD || strongBlink) && now - this.lastBlinkAt > BLINK_RESET_FRAMES_MESH) {
      this.blinkCount += 1
      this.blinkActive = true
      this.lastBlinkAt = now
    } else if (this.blinkActive && averageEar > BLINK_THRESHOLD + 0.025 && smoothedEar > BLINK_THRESHOLD + 0.015) {
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
    const previousFatigueScore = this.latestSnapshot.fatigueScore
    const fatigueAlpha = fatigueTarget > previousFatigueScore ? FATIGUE_RISE_ALPHA : FATIGUE_FALL_ALPHA
    const nextFatigueScore = clamp(
      previousFatigueScore + (fatigueTarget - previousFatigueScore) * fatigueAlpha,
      0,
      drowsy ? 1 : 0.5
    )
    const confidence = clamp(0.55 + (1 - Math.abs(leftEar - rightEar)) * 0.25 - (lowLight ? 0.12 : 0))
    const webcamState = nextFatigueScore < 0.33 ? 'Stable' : nextFatigueScore < 0.66 ? 'Watch' : 'Elevated'

    this.pushMetrics({
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
      webcam_risk: Number(nextFatigueScore.toFixed(4)),
      webcam_state: webcamState,
      notes_risk: 0,
      notes_state: 'No notes',
      face_box: {
        x: Number(minX.toFixed(4)),
        y: Number(minY.toFixed(4)),
        width: Number((maxX - minX).toFixed(4)),
        height: Number((maxY - minY).toFixed(4))
      }
    }, nextFatigueScore)
  }

  private pushMetrics(metrics: WebcamMetrics, fatigueScore: number) {
    const now = performance.now()
    const cameraModuleOpen = window.localStorage.getItem('prechaos-camera-module-open') === 'true'
    const emitInterval = cameraModuleOpen ? CAMERA_MODULE_EMIT_INTERVAL_MS : BACKGROUND_EMIT_INTERVAL_MS
    if (now - this.lastEmittedAt < emitInterval) {
      this.latestSnapshot = {
        ...this.latestSnapshot,
        fatigueScore,
        metrics,
        webcamState: 'active',
        status: 'running',
        stream: this.stream,
        error: null,
        updatedAt: this.latestSnapshot.updatedAt
      }
      return
    }

    this.lastEmittedAt = now
    this.emit({
      status: 'running',
      webcamState: 'active',
      fatigueScore,
      metrics,
      stream: this.stream,
      error: null
    })
  }
}

export const faceMeshService =
  globalThis.__netheriteFaceMeshService ?? (globalThis.__netheriteFaceMeshService = new FaceMeshService())
