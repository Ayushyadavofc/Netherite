import { useEffect, useMemo, useRef } from 'react'

import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'
import { PRECHAOS_WINDOW_SIZE } from './types'
import { useBehaviorCollector } from './useBehaviorCollector'
import { useOptionalWebcamFatigue } from './useOptionalWebcamFatigue'

type RuntimeOptions = {
  userId?: string
  enableWebcam?: boolean
  enabled?: boolean
}

export function usePreChaosRuntime(options: RuntimeOptions = {}) {
  const userId = options.userId ?? 'local-user'
  const enabled = options.enabled ?? true
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const behaviorWindow = usePreChaosStore((state) => state.behaviorWindow)
  const appContext = usePreChaosStore((state) => state.appContext)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const currentPrediction = usePreChaosStore((state) => state.currentPrediction)
  const setSidecarState = usePreChaosStore((state) => state.setSidecarState)
  const setPrediction = usePreChaosStore((state) => state.setPrediction)
  const setBaseline = usePreChaosStore((state) => state.setBaseline)
  const setSessionReplays = usePreChaosStore((state) => state.setSessionReplays)
  const lastPredictionRef = useRef(0)
  const lastPassivePredictWarningAtRef = useRef(0)
  const baselineSyncedRef = useRef(false)
  const sessionIdRef = useRef(crypto.randomUUID())
  const lastCollectedTimestampRef = useRef(0)
  const lastCollectedEventTimestampRef = useRef(0)
  const autoTrainTriggeredRef = useRef(false)

  const { isStudyContext, studyContextEnteredAt } = useBehaviorCollector({ enabled })
  useOptionalWebcamFatigue({ enabled: enabled && webcamOptIn })

  const latestBehaviorTimestamp = behaviorWindow[behaviorWindow.length - 1]?.timestamp ?? 0
  const hasFreshStudySample = studyContextEnteredAt !== null && latestBehaviorTimestamp >= studyContextEnteredAt

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    setSidecarState('connecting', null)
    const boot = async () => {
      try {
        await preChaosBridge.start()
        const state = await preChaosBridge.getState()
        if (!cancelled) {
          setSidecarState(state.online ? 'online' : 'offline', state.reason ?? null)
        }
        const baseline = await preChaosBridge.getBaseline(userId)
        if (!cancelled) {
          setBaseline(baseline)
          const sessions = await preChaosBridge.getSessionReplays().catch(() => [])
          if (!cancelled) {
            setSessionReplays(sessions)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSidecarState('offline', error instanceof Error ? error.message : 'PreChaos is unavailable.')
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [enabled, setBaseline, setSessionReplays, setSidecarState, userId])

  const shouldPredict = useMemo(() => behaviorWindow.length >= PRECHAOS_WINDOW_SIZE, [behaviorWindow.length])

  useEffect(() => {
    if (!enabled || !shouldPredict || isStudyContext || !import.meta.env.DEV) {
      return
    }

    const now = Date.now()
    if (now - lastPassivePredictWarningAtRef.current < 5_000) {
      return
    }

    lastPassivePredictWarningAtRef.current = now
    console.warn('PreChaos regression: prediction was attempted while study monitoring is paused.', {
      route: appContext.route,
      page: appContext.page_name
    })
  }, [appContext.page_name, appContext.route, enabled, isStudyContext, shouldPredict])

  useEffect(() => {
    if (!enabled || !shouldPredict || sidecarState === 'offline' || !isStudyContext || !hasFreshStudySample) {
      return
    }
    const now = Date.now()
    if (now - lastPredictionRef.current < 2_000) {
      return
    }
    lastPredictionRef.current = now

    let cancelled = false
    const runPrediction = async () => {
      try {
        const prediction = await preChaosBridge.predict(
          behaviorWindow.map((entry) => entry.features),
          userId,
          appContext
        )
        if (!cancelled) {
          setPrediction(prediction)
          setSidecarState('online', null)
        }
      } catch (error) {
        if (!cancelled) {
          setSidecarState('offline', error instanceof Error ? error.message : 'Prediction request failed.')
        }
      }
    }
    void runPrediction()

    return () => {
      cancelled = true
    }
  }, [
    appContext,
    behaviorWindow,
    enabled,
    hasFreshStudySample,
    isStudyContext,
    setPrediction,
    setSidecarState,
    shouldPredict,
    sidecarState,
    userId
  ])

  useEffect(() => {
    if (!enabled || !shouldPredict || sidecarState === 'offline' || baselineSyncedRef.current || !isStudyContext || !hasFreshStudySample) {
      return
    }

    let cancelled = false
    const syncBaseline = async () => {
      try {
        const baseline = await preChaosBridge.getBaseline(userId)
        if ((baseline.samples_seen ?? 0) < PRECHAOS_WINDOW_SIZE) {
          const updated = await preChaosBridge.updateBaseline(
            behaviorWindow.map((entry) => entry.features),
            userId
          )
          if (!cancelled && updated) {
            setBaseline(updated)
            baselineSyncedRef.current = true
          }
          return
        }
        if (!cancelled) {
          setBaseline(baseline)
          baselineSyncedRef.current = true
        }
      } catch {
        // Keep the app usable even when baseline sync is unavailable.
      }
    }

    void syncBaseline()
    return () => {
      cancelled = true
    }
  }, [behaviorWindow, enabled, hasFreshStudySample, isStudyContext, setBaseline, shouldPredict, sidecarState, userId])

  useEffect(() => {
    if (!enabled || sidecarState === 'offline' || behaviorWindow.length === 0 || !isStudyContext || !hasFreshStudySample) {
      return
    }

    let cancelled = false
    const flush = async () => {
      const samples = behaviorWindow
        .filter((entry) => entry.timestamp > lastCollectedTimestampRef.current)
        .map((entry) => ({
          timestamp: entry.timestamp,
          features: entry.features,
          context: appContext,
          prediction: currentPrediction
            ? {
                risk: currentPrediction.risk,
                state: currentPrediction.state,
                confidence: currentPrediction.confidence
              }
            : null
        }))
      const recentEvents = usePreChaosStore
        .getState()
        .recentEvents.filter((event) => event.timestamp > lastCollectedEventTimestampRef.current)
        .map((event) => ({
          timestamp: event.timestamp,
          type: event.type,
          label: event.label,
          route: event.route,
          importance: event.importance
        }))

      if (samples.length === 0 && recentEvents.length === 0) {
        return
      }

      try {
        await preChaosBridge.collect({
          userId,
          sessionId: sessionIdRef.current,
          samples,
          events: recentEvents
        })
        if (!cancelled) {
          const sessions = await preChaosBridge.getSessionReplays().catch(() => [])
          if (!cancelled) {
            setSessionReplays(sessions)
          }
          if (samples.length > 0) {
            lastCollectedTimestampRef.current = samples[samples.length - 1].timestamp
          }
          if (recentEvents.length > 0) {
            lastCollectedEventTimestampRef.current = recentEvents[recentEvents.length - 1].timestamp as number
          }
        }
      } catch {
        // Collection failure should never break the app.
      }
    }

    const timer = window.setTimeout(() => {
      void flush()
    }, 15_000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [appContext, behaviorWindow, currentPrediction, enabled, hasFreshStudySample, isStudyContext, setSessionReplays, sidecarState, userId])

  useEffect(() => {
    if (!enabled || sidecarState === 'offline' || autoTrainTriggeredRef.current) {
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        const status = await preChaosBridge.getDatasetStatus()
        if (
          !autoTrainTriggeredRef.current &&
          status.ready_for_training &&
          status.sample_count >= 1500 &&
          status.session_count >= 5 &&
          currentPrediction?.mode !== 'trained'
        ) {
          autoTrainTriggeredRef.current = true
          await preChaosBridge.trainOnLiveData()
          const sessions = await preChaosBridge.getSessionReplays().catch(() => [])
          setSessionReplays(sessions)
        }
      } catch {
        // Automatic training should remain opportunistic.
      }
    }, 60_000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPrediction?.mode, enabled, setSessionReplays, sidecarState])
}
