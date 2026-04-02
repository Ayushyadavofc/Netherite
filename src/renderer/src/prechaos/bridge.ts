import type {
  CameraModuleMode,
  CameraModuleSnapshot,
  PreChaosBaseline,
  PreChaosContext,
  PreChaosDatasetStatus,
  PreChaosFeedbackLabel,
  PreChaosPrediction,
  SessionReplay
} from './types'

export const preChaosBridge = {
  start: () => window.electronAPI.preChaosStart(),
  getState: () => window.electronAPI.preChaosState(),
  log: (message: string) => window.electronAPI.preChaosLog(message),
  predict: (features: number[][], userId: string, context?: PreChaosContext) =>
    window.electronAPI.preChaosPredict(features, userId, context) as Promise<PreChaosPrediction>,
  sendFeedback: (label: PreChaosFeedbackLabel, risk: number, userId: string) =>
    window.electronAPI.preChaosFeedback({ label, risk, userId }),
  getBaseline: (userId: string) => window.electronAPI.preChaosBaseline({ userId }) as Promise<PreChaosBaseline>,
  updateBaseline: (features: number[][], userId: string) =>
    window.electronAPI.preChaosBaseline({ userId, features }) as Promise<PreChaosBaseline>,
  collect: (payload: {
    userId?: string
    sessionId: string
    samples: Array<{
      timestamp: number
      features: number[]
      context: Record<string, unknown>
      prediction?: { risk: number; state: string; confidence: number } | null
    }>
    events?: Array<Record<string, unknown>>
  }) => window.electronAPI.preChaosCollect(payload),
  getDatasetStatus: () => window.electronAPI.preChaosDatasetStatus() as Promise<PreChaosDatasetStatus>,
  trainOnLiveData: () =>
    window.electronAPI.preChaosTrainLive() as Promise<{
      model_path: string
      scaler_path: string
      metrics: Record<string, unknown>
      mode: string
    }>,
  getSessionReplays: () => window.electronAPI.preChaosSessionReplays() as Promise<SessionReplay[]>,
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
