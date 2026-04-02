import { useEffect, useRef, useState } from 'react'

import { DEFAULT_WEBCAM_METRICS } from './faceMeshService'
import { useFaceTracking } from './useFaceTracking'
import { usePreChaosStore } from './store'
import { WEBCAM_NEUTRAL_FATIGUE_SCORE } from './webcam-status'

type WebcamOptions = {
  enabled: boolean
}

export function useOptionalWebcamFatigue({ enabled }: WebcamOptions) {
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  const tracking = useFaceTracking({ enabled: trackingEnabled })
  const lastEventRef = useRef<string | null>(null)
  const setWebcamEnabled = usePreChaosStore((state) => state.setWebcamEnabled)
  const setWebcamState = usePreChaosStore((state) => state.setWebcamState)
  const setWebcamStream = usePreChaosStore((state) => state.setWebcamStream)
  const setWebcamMetrics = usePreChaosStore((state) => state.setWebcamMetrics)
  const setFatigueScore = usePreChaosStore((state) => state.setFatigueScore)
  const logEvent = usePreChaosStore((state) => state.logEvent)

  useEffect(() => {
    if (!enabled) {
      setTrackingEnabled(false)
      return
    }

    setTrackingEnabled(true)

    return () => {
      setTrackingEnabled(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !trackingEnabled) {
      setWebcamEnabled(false)
      setWebcamState('disabled')
      setWebcamStream(null)
      setWebcamMetrics(DEFAULT_WEBCAM_METRICS)
      setFatigueScore(0)
      lastEventRef.current = null
      return
    }

    setWebcamEnabled(tracking.status === 'starting' || tracking.status === 'running')
    setWebcamState(tracking.webcamState)
    setWebcamStream(tracking.stream)
    setWebcamMetrics(tracking.metrics)
    setFatigueScore(tracking.fatigueScore)
  }, [
    enabled,
    setFatigueScore,
    setWebcamEnabled,
    setWebcamMetrics,
    setWebcamState,
    setWebcamStream,
    trackingEnabled,
    tracking.fatigueScore,
    tracking.metrics,
    tracking.status,
    tracking.stream,
    tracking.webcamState
  ])

  useEffect(() => {
    if (!enabled || !trackingEnabled) {
      return
    }

    let nextEvent: string | null = null

    if (tracking.webcamState === 'blocked' && tracking.error) {
      nextEvent = `Camera unavailable: ${tracking.error}`
    } else if (tracking.metrics.fatigue_status === 'Drowsy') {
      nextEvent = 'EAR stayed low: fatigue risk rising'
    } else if (tracking.metrics.face_detected) {
      nextEvent = 'Face tracked'
    } else if (tracking.webcamState === 'active') {
      nextEvent = 'Face moved out of frame'
    }

    if (!nextEvent || nextEvent === lastEventRef.current) {
      return
    }

    lastEventRef.current = nextEvent
    logEvent({
      type: 'webcam',
      label: nextEvent,
      route: window.location.hash.replace(/^#/, '') || '/',
      importance:
        tracking.webcamState === 'blocked'
          ? 'high'
          : tracking.metrics.fatigue_status === 'Drowsy'
            ? 'high'
            : 'low'
    })
  }, [enabled, logEvent, tracking.error, tracking.metrics.face_detected, tracking.metrics.fatigue_status, tracking.webcamState, trackingEnabled])

  useEffect(() => {
    if (!enabled || !trackingEnabled || tracking.webcamState !== 'blocked') {
      return
    }

    setFatigueScore(WEBCAM_NEUTRAL_FATIGUE_SCORE)
  }, [enabled, setFatigueScore, tracking.webcamState, trackingEnabled])
}
