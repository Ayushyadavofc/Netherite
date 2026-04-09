import { useEffect, useRef, useState } from 'react'

import { PRECHAOS_APP_EVENT, type PreChaosAppEventDetail } from './app-events'
import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'
import type { PomodoroAction } from './types'
import { toast } from '@/hooks/use-toast'

const POMODORO_STUDY_DURATION_MS = 25 * 60 * 1000
const POMODORO_BREAK_DURATION_MS = 5 * 60 * 1000
const FOCUSED_EXTENSION_MS = 5 * 60 * 1000
const FOCUSED_EXTENSION_MIN_RUNNING_MS = 20 * 60 * 1000
const FOCUSED_EXTENSION_REMAINING_THRESHOLD_MS = 8 * 60 * 1000

export function CameraModuleStateSync() {
  const webcamEnabled = usePreChaosStore((state) => state.webcamEnabled)
  const webcamRecovering = usePreChaosStore((state) => state.webcamRecovering)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const webcamMetrics = usePreChaosStore((state) => state.webcamMetrics)
  const fatigueScore = usePreChaosStore((state) => state.fatigueScore)
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const currentPrediction = usePreChaosStore((state) => state.currentPrediction)
  const pomodoro = usePreChaosStore((state) => state.pomodoro)
  const setPomodoroState = usePreChaosStore((state) => state.setPomodoroState)
  const [dataPulse, setDataPulse] = useState({
    lastSavedAt: 0,
    magnitude: 0,
    label: ''
  })
  const [windowOpen, setWindowOpen] = useState(false)
  const lastClosedSyncAtRef = useRef(0)
  const lastRecoverySyncAtRef = useRef(0)
  const pomodoroRef = useRef(pomodoro)

  useEffect(() => {
    pomodoroRef.current = pomodoro
  }, [pomodoro])

  useEffect(() => {
    let cancelled = false
    void preChaosBridge.getCameraModuleState().then((state) => {
      if (!cancelled) {
        setWindowOpen(state.windowOpen)
        window.localStorage.setItem('prechaos-camera-module-open', String(state.windowOpen))
      }
    })

    const unsubscribe = preChaosBridge.onCameraModuleState((payload) => {
      if (!cancelled) {
        setWindowOpen(payload.windowOpen)
        window.localStorage.setItem('prechaos-camera-module-open', String(payload.windowOpen))

        if (payload.pomodoroAction) {
          handlePomodoroAction(payload.pomodoroAction)
        }
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const handlePomodoroAction = (action: PomodoroAction) => {
    const current = pomodoroRef.current
    switch (action.type) {
      case 'start': {
        if (current.phase === 'idle') {
          setPomodoroState({
            phase: 'studying',
            isRunning: true,
            remainingMs: current.studyDurationMs,
            studyBlockStartedAt: Date.now(),
            targetEndTime: Date.now() + current.studyDurationMs,
            blockExtended: false
          })
        } else {
          setPomodoroState({
            isRunning: true,
            remainingMs: current.remainingMs,
            targetEndTime: Date.now() + current.remainingMs
          })
        }
        break
      }
      case 'pause':
        setPomodoroState({
          isRunning: false,
          remainingMs: current.remainingMs,
          targetEndTime: null
        })
        break
      case 'reset':
        setPomodoroState({
          phase: 'idle',
          remainingMs: POMODORO_STUDY_DURATION_MS,
          studyDurationMs: POMODORO_STUDY_DURATION_MS,
          breakDurationMs: POMODORO_BREAK_DURATION_MS,
          isRunning: false,
          blockExtended: false,
          studyBlockStartedAt: null,
          targetEndTime: null
        })
        break
      case 'skipBreak':
        if (current.phase === 'break') {
          setPomodoroState({
            phase: 'studying',
            remainingMs: POMODORO_STUDY_DURATION_MS,
            studyDurationMs: POMODORO_STUDY_DURATION_MS,
            breakDurationMs: POMODORO_BREAK_DURATION_MS,
            isRunning: false,
            blockExtended: false,
            studyBlockStartedAt: null,
            targetEndTime: null
          })
        }
        break
      case 'takeBreak': {
        const extraMs = action.extraBreakMs ?? 0
        const breakDuration = POMODORO_BREAK_DURATION_MS + extraMs
        setPomodoroState({
          phase: 'break',
          remainingMs: breakDuration,
          breakDurationMs: breakDuration,
          isRunning: true,
          blockExtended: false,
          studyBlockStartedAt: null,
          targetEndTime: Date.now() + breakDuration
        })
        break
      }
    }
  }

  // Pomodoro timer tick (using delta time to fix OS sleep drift)
  useEffect(() => {
    if (!pomodoro.isRunning) return

    const timer = window.setInterval(() => {
      const current = pomodoroRef.current
      if (!current.isRunning || !current.targetEndTime) return

      const now = Date.now()
      const nextRemaining = Math.max(0, current.targetEndTime - now)

      if (nextRemaining <= 0) {
        if (current.phase === 'studying') {
          toast({
            title: 'Study session complete',
            description: 'Time for a break.',
            duration: 4000
          })
          setPomodoroState({
            phase: 'break',
            remainingMs: current.breakDurationMs,
            isRunning: true,
            blockExtended: false,
            studyBlockStartedAt: null,
            targetEndTime: Date.now() + current.breakDurationMs
          })
        } else if (current.phase === 'break') {
          toast({
            title: 'Break is over',
            description: 'Break over. Ready to study?',
            duration: 4000
          })
          setPomodoroState({
            phase: 'studying',
            remainingMs: POMODORO_STUDY_DURATION_MS,
            studyDurationMs: POMODORO_STUDY_DURATION_MS,
            breakDurationMs: POMODORO_BREAK_DURATION_MS,
            isRunning: false,
            blockExtended: false,
            studyBlockStartedAt: null,
            targetEndTime: null
          })
        }
      } else {
        setPomodoroState({
          remainingMs: nextRemaining,
          targetEndTime: current.targetEndTime
        })
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [pomodoro.isRunning, setPomodoroState])

  // Adaptive extension for focused state
  useEffect(() => {
    if (
      pomodoro.phase !== 'studying' ||
      !pomodoro.isRunning ||
      pomodoro.blockExtended ||
      !pomodoro.targetEndTime ||
      !currentPrediction
    ) {
      return
    }

    if (currentPrediction.state !== 'focused') return

    const now = Date.now()
    const runningMs = now - (pomodoro.targetEndTime - pomodoro.remainingMs)
    if (
      runningMs > FOCUSED_EXTENSION_MIN_RUNNING_MS &&
      pomodoro.remainingMs < FOCUSED_EXTENSION_REMAINING_THRESHOLD_MS
    ) {
      setPomodoroState({
        remainingMs: pomodoro.remainingMs + FOCUSED_EXTENSION_MS,
        targetEndTime: pomodoro.targetEndTime + FOCUSED_EXTENSION_MS,
        blockExtended: true
      })
    }
  }, [currentPrediction, pomodoro.phase, pomodoro.isRunning, pomodoro.blockExtended, pomodoro.remainingMs, pomodoro.targetEndTime, setPomodoroState])

  useEffect(() => {
    const handleAppEvent = (event: Event) => {
      const detail = (event as CustomEvent<PreChaosAppEventDetail>).detail
      if (!detail || detail.action !== 'note_saved') {
        return
      }

      const bytes = typeof detail.metadata?.bytes === 'number' ? detail.metadata.bytes : 0
      const words = typeof detail.metadata?.words === 'number' ? detail.metadata.words : 0
      const isLargeSave = bytes >= 6000 || words >= 900

      if (!isLargeSave) {
        return
      }

      const magnitude = Math.min(1, Math.max(bytes / 24000, words / 2200, 0.35))
      setDataPulse({
        lastSavedAt: Date.now(),
        magnitude,
        label: 'Local memory archived'
      })
    }

    window.addEventListener(PRECHAOS_APP_EVENT, handleAppEvent as EventListener)
    return () => {
      window.removeEventListener(PRECHAOS_APP_EVENT, handleAppEvent as EventListener)
    }
  }, [])

  useEffect(() => {
    const compactMetrics = {
      ...webcamMetrics,
      preview_frame: undefined,
      face_landmarks: [],
      face_outline: [],
      left_eye_outline: [],
      right_eye_outline: []
    }
    const payload = {
      webcamEnabled,
      webcamOptIn,
      webcamState,
      webcamMetrics: windowOpen ? webcamMetrics : compactMetrics,
      fatigueScore,
      sidecarState,
      dataPulse,
      prediction: currentPrediction
        ? {
            risk: currentPrediction.risk,
            state: currentPrediction.state,
            confidence: currentPrediction.confidence
          }
        : null,
      pomodoro
    }

    if (!windowOpen && webcamEnabled) {
      const now = Date.now()
      if (now - lastClosedSyncAtRef.current < 1500) {
        return
      }
      lastClosedSyncAtRef.current = now
    }

    if (webcamRecovering) {
      const now = Date.now()
      if (now - lastRecoverySyncAtRef.current < 2000) {
        return
      }
      lastRecoverySyncAtRef.current = now
    }

    preChaosBridge.syncCameraModuleState(payload)
  }, [
    currentPrediction,
    dataPulse,
    fatigueScore,
    pomodoro,
    sidecarState,
    webcamEnabled,
    webcamRecovering,
    webcamMetrics,
    webcamOptIn,
    webcamState,
    windowOpen
  ])

  return null
}
