import { useEffect, useRef } from 'react'

import { preChaosBridge } from './bridge'
import { usePreChaosStore } from './store'
import { useBehaviorCollector } from './useBehaviorCollector'
import { useOptionalWebcamFatigue } from './useOptionalWebcamFatigue'

type RuntimeOptions = {
  userId?: string
  enableWebcam?: boolean
  enabled?: boolean
}

const COLLECT_DEBOUNCE_MS = 2_000
const MAX_EVENTS_PER_BATCH = 48

export function usePreChaosRuntime(options: RuntimeOptions = {}) {
  const userId = options.userId ?? 'local-user'
  const enabled = options.enabled ?? true
  const sidecarState = usePreChaosStore((state) => state.sidecarState)
  const behaviorWindow = usePreChaosStore((state) => state.behaviorWindow)
  const webcamOptIn = usePreChaosStore((state) => state.webcamOptIn)
  const currentPrediction = usePreChaosStore((state) => state.currentPrediction)
  const lastPredictionRequestId = usePreChaosStore((state) => state.lastPredictionRequestId)
  const setSidecarState = usePreChaosStore((state) => state.setSidecarState)
  const setPrediction = usePreChaosStore((state) => state.setPrediction)
  const sessionIdRef = useRef(crypto.randomUUID())
  const previousStudyContextRef = useRef(false)
  const previousSidecarStateRef = useRef<string | null>(null)
  const lastCollectedTimestampRef = useRef(behaviorWindow[behaviorWindow.length - 1]?.timestamp ?? 0)
  const autoTrainTriggeredRef = useRef(false)
  const requestSequenceRef = useRef(0)
  const pendingRequestIdRef = useRef<string | null>(null)

  const { isStudyContext, studyContextEnteredAt } = useBehaviorCollector({ enabled })
  useOptionalWebcamFatigue({ enabled: enabled && webcamOptIn })

  useEffect(() => {
    if (isStudyContext && !previousStudyContextRef.current) {
      sessionIdRef.current = crypto.randomUUID()
      lastCollectedTimestampRef.current = Date.now()
      requestSequenceRef.current += 1
    }

    previousStudyContextRef.current = isStudyContext
  }, [isStudyContext])

  useEffect(() => {
    if (previousSidecarStateRef.current === sidecarState) {
      return
    }

    const line = `[PRECHAOS][${new Date().toISOString()}] sidecar state ${previousSidecarStateRef.current ?? 'unknown'} -> ${sidecarState}`
    console.log(line)
    void window.electronAPI.appLog(line)
    previousSidecarStateRef.current = sidecarState
  }, [sidecarState])

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
  }, [enabled, setSidecarState])

  useEffect(() => {
    if (!enabled || sidecarState === 'offline' || behaviorWindow.length === 0) {
      return
    }

    let cancelled = false

    const buildPendingBatches = () => {
      const pendingEntries = behaviorWindow
        .filter((entry) => entry.timestamp > lastCollectedTimestampRef.current)
        .sort((left, right) => left.timestamp - right.timestamp)

      if (pendingEntries.length === 0) {
        return []
      }

      const batches: Array<{
        entries: typeof pendingEntries
        writeToDataset: boolean
      }> = []

      for (const entry of pendingEntries) {
        const lastBatch = batches[batches.length - 1]
        if (
          !lastBatch ||
          lastBatch.writeToDataset !== entry.writeToDataset ||
          lastBatch.entries.length >= MAX_EVENTS_PER_BATCH
        ) {
          batches.push({
            entries: [entry],
            writeToDataset: entry.writeToDataset
          })
          continue
        }

        lastBatch.entries.push(entry)
      }

      return batches
    }

    const flush = async () => {
      const batches = buildPendingBatches()
      if (batches.length === 0) {
        return
      }

      requestSequenceRef.current += 1
      const currentSequence = requestSequenceRef.current
      const requestId = `${sessionIdRef.current}-${currentSequence}-${Date.now()}`
      pendingRequestIdRef.current = requestId

      try {
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]
          if (cancelled || requestSequenceRef.current !== currentSequence) {
            return
          }

          const response = await preChaosBridge.collect({
            userId,
            sessionId: sessionIdRef.current,
            sessionStartedAt: studyContextEnteredAt,
            writeToDataset: batch.writeToDataset,
            predict: i === batches.length - 1,
            requestId,
            events: batch.entries.map((entry) => entry.event)
          })

          if (cancelled) {
            return
          }

          if (pendingRequestIdRef.current !== requestId) {
            return
          }

          const lastTimestamp = batch.entries[batch.entries.length - 1]?.timestamp
          if (typeof lastTimestamp === 'number') {
            lastCollectedTimestampRef.current = Math.max(lastCollectedTimestampRef.current, lastTimestamp)
          }

          if (response.prediction && response.requestId === requestId) {
            setPrediction(response.prediction, Date.now(), requestId)
          }
        }

        if (cancelled || requestSequenceRef.current !== currentSequence) {
          return
        }

        setSidecarState('online', null)
      } catch (error) {
        if (!cancelled && requestSequenceRef.current === currentSequence) {
          setSidecarState('offline', error instanceof Error ? error.message : 'Collection request failed.')
        }
      }
    }

    const timer = window.setTimeout(() => {
      void flush()
    }, COLLECT_DEBOUNCE_MS)

    return () => {
      cancelled = true
      pendingRequestIdRef.current = null
      window.clearTimeout(timer)
    }
  }, [
    behaviorWindow,
    enabled,
    setPrediction,
    setSidecarState,
    sidecarState,
    studyContextEnteredAt,
    userId
  ])

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
        }
      } catch {
        // Automatic training should remain opportunistic.
      }
    }, 60_000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPrediction?.mode, enabled, sidecarState])
}
