import type {
  CameraModuleMode,
  CameraModuleSnapshot,
  DailyRhythmSummary,
  PreChaosBaseline,
  PreChaosDatasetStatus,
  PreChaosFeedbackLabel,
  PreChaosPrediction,
  PreChaosRawEvent,
  SessionReplay
} from './types'

const PRECHAOS_BASE_URL = 'http://127.0.0.1:8765'

const describeError = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

const logBridgeEvent = (message: string) => {
  const line = `[PRECHAOS][${new Date().toISOString()}] ${message}`
  console.log(line)
  void window.electronAPI.appLog(line)
}

const withBridgeLogging = async <T>(label: string, action: () => Promise<T>, details?: string) => {
  logBridgeEvent(`${label} start${details ? ` | ${details}` : ''}`)
  try {
    const result = await action()
    logBridgeEvent(`${label} success`)
    return result
  } catch (error) {
    logBridgeEvent(`${label} error | ${describeError(error)}`)
    throw error
  }
}

export const preChaosBridge = {
  getEndpoint: () => PRECHAOS_BASE_URL,
  start: () => withBridgeLogging('bridge.start', () => window.electronAPI.preChaosStart()),
  getState: () => withBridgeLogging('bridge.getState', () => window.electronAPI.preChaosState()),
  log: (message: string) => window.electronAPI.preChaosLog(message),
  predict: (events: PreChaosRawEvent[], sessionId: string, userId: string) =>
    withBridgeLogging(
      'bridge.predict',
      () => window.electronAPI.preChaosPredict(events, sessionId, userId) as Promise<PreChaosPrediction>,
      `events=${events.length} session=${sessionId} user=${userId}`
    ),
  sendFeedback: (label: PreChaosFeedbackLabel, risk: number, userId: string) =>
    withBridgeLogging(
      'bridge.sendFeedback',
      () => window.electronAPI.preChaosFeedback({ label, risk, userId }),
      `label=${label} risk=${risk.toFixed(4)} user=${userId}`
    ),
  getBaseline: (userId: string) =>
    withBridgeLogging(
      'bridge.getBaseline',
      () => window.electronAPI.preChaosBaseline({ userId }) as Promise<PreChaosBaseline>,
      `user=${userId}`
    ),
  updateBaseline: (events: PreChaosRawEvent[], sessionId: string, userId: string, sessionStartedAt?: number | null) =>
    withBridgeLogging(
      'bridge.updateBaseline',
      () =>
        window.electronAPI.preChaosBaseline({ userId, sessionId, sessionStartedAt, events }) as Promise<PreChaosBaseline>,
      `events=${events.length} session=${sessionId} user=${userId}`
    ),
  collect: (payload: {
    userId?: string
    sessionId: string
    sessionStartedAt?: number | null
    writeToDataset: boolean
    predict?: boolean
    requestId?: string
    events: PreChaosRawEvent[]
  }) =>
    withBridgeLogging(
      'bridge.collect',
      () =>
        window.electronAPI.preChaosCollect(payload) as Promise<{
          requestId: string
          appended_samples: number
          appended_events: number
          ready_for_training: boolean
          prediction?: PreChaosPrediction | null
        }>,
      `events=${payload.events.length} session=${payload.sessionId} predict=${String(payload.predict)} requestId=${payload.requestId ?? 'none'}`
    ),
  getDatasetStatus: () =>
    withBridgeLogging('bridge.getDatasetStatus', () => window.electronAPI.preChaosDatasetStatus() as Promise<PreChaosDatasetStatus>),
  trainOnLiveData: () =>
    withBridgeLogging(
      'bridge.trainOnLiveData',
      () =>
        window.electronAPI.preChaosTrainLive() as Promise<{
          model_path: string
          scaler_path: string
          metrics: Record<string, unknown>
          mode: string
        }>
    ),
  getSessionReplays: () =>
    withBridgeLogging('bridge.getSessionReplays', () => window.electronAPI.preChaosSessionReplays() as Promise<SessionReplay[]>),
  getDailyRhythm: (userId?: string) =>
    withBridgeLogging(
      'bridge.getDailyRhythm',
      () => window.electronAPI.preChaosDailyRhythm({ userId }) as Promise<DailyRhythmSummary>,
      `user=${userId ?? 'default'}`
    ),
  openCameraModule: () => window.electronAPI.preChaosCameraModuleOpen() as Promise<CameraModuleSnapshot>,
  closeCameraModule: () => window.electronAPI.preChaosCameraModuleClose() as Promise<CameraModuleSnapshot>,
  getCameraModuleState: () => window.electronAPI.preChaosCameraModuleState() as Promise<CameraModuleSnapshot>,
  setCameraModuleMode: (mode: CameraModuleMode) =>
    window.electronAPI.preChaosCameraModuleSetMode(mode) as Promise<CameraModuleSnapshot>,
  syncCameraModuleState: (payload: Partial<CameraModuleSnapshot>) =>
    window.electronAPI.preChaosCameraModuleSync(payload),
  onCameraModuleState: (listener: (payload: CameraModuleSnapshot) => void) =>
    window.electronAPI.onPreChaosCameraModuleState(listener)
}
