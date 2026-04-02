import { useEffect, useRef, useState } from 'react'

import { PRECHAOS_APP_EVENT, type PreChaosAppEventDetail } from './app-events'
import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'

export function CameraModuleStateSync() {
  const webcamEnabled = usePreChaosStore((state) => state.webcamEnabled)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const webcamState = usePreChaosStore((state) => state.webcamState)
  const webcamMetrics = usePreChaosStore((state) => state.webcamMetrics)
  const fatigueScore = usePreChaosStore((state) => state.fatigueScore)
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const currentPrediction = usePreChaosStore((state) => state.currentPrediction)
  const [dataPulse, setDataPulse] = useState({
    lastSavedAt: 0,
    magnitude: 0,
    label: ''
  })
  const [windowOpen, setWindowOpen] = useState(false)
  const lastClosedSyncAtRef = useRef(0)

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
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

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
        : null
    }

    if (!windowOpen && webcamEnabled) {
      const now = Date.now()
      if (now - lastClosedSyncAtRef.current < 1500) {
        return
      }
      lastClosedSyncAtRef.current = now
    }

    preChaosBridge.syncCameraModuleState(payload)

    if (!windowOpen) {
      return
    }

    const heartbeat = window.setInterval(() => {
      preChaosBridge.syncCameraModuleState(payload)
    }, 1000)

    return () => {
      window.clearInterval(heartbeat)
    }
  }, [
    currentPrediction,
    dataPulse,
    fatigueScore,
    sidecarState,
    webcamEnabled,
    webcamMetrics,
    webcamOptIn,
    webcamState,
    windowOpen
  ])

  return null
}
