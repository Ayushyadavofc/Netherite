import type { RuntimeAppConfig } from '../../shared/runtime-config'
import type { CameraModuleMode, CameraModuleSnapshot, PreChaosRawEvent } from './prechaos/types'

export interface ElectronFsNode {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: ElectronFsNode[]
  content?: string
}

export interface ElectronSyncProgressPayload {
  stage: 'checking' | 'zipping' | 'uploading' | 'downloading' | 'extracting' | 'applying'
  message: string
  currentBytes?: number
  totalBytes?: number
  percent?: number
}

export interface ElectronAPI {
  runtimeConfig: RuntimeAppConfig
  appLaunchId: string
  appLog: (message: string) => Promise<{ ok: boolean }>
  readAccountFile: <T = unknown>(userId: string, filename: string) => Promise<T | null>
  writeAccountFile: <T = unknown>(userId: string, filename: string, data: T) => Promise<T>
  migrateGuestData: (userId: string) => Promise<boolean>
  zipAccountData: (userId: string) => Promise<string>
  zipVault: (vaultPath: string) => Promise<string>
  unzipAccountData: (userId: string, zipPath: string) => Promise<string>
  unzipVault: (zipPath: string, targetPath: string) => Promise<string>
  mergeVaultFromZip: (localVaultPath: string, zipPath: string) => Promise<{ updated: string[]; added: string[] }>
  clearTemp: () => Promise<boolean>
  readBinaryFile: (filePath: string) => Promise<Uint8Array>
  writeTempFile: (filename: string, data: ArrayBuffer) => Promise<string>
  onSyncProgress: (listener: (payload: ElectronSyncProgressPayload) => void) => () => void
  directoryExists: (dirPath: string) => Promise<boolean>
  selectFolder: () => Promise<string | null>
  activateVault: (vaultPath: string, options?: { readOnly?: boolean }) => Promise<string>
  createVault: (parentPath: string, vaultName: string, welcomeContent: string) => Promise<string>
  createVaultAtPath: (targetPath: string, welcomeContent: string) => Promise<string>
  initVault: (
    vaultPath: string,
    userId: string
  ) => Promise<{ ownerId?: string; vaultId?: string; createdAt?: string }>
  checkVaultOwnership: (
    vaultPath: string,
    userId: string
  ) => Promise<{ owned: true } | { owned: false; ownerId?: string } | { owned: null }>
  cloneVault: (sourcePath: string, userId: string) => Promise<string>
  readFolder: (dirPath: string, options?: { includeMarkdownContent?: boolean }) => Promise<ElectronFsNode[]>
  readFile: (filePath: string) => Promise<string>
  fileExists: (filePath: string) => Promise<boolean>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  createFolder: (dirPath: string) => Promise<boolean>
  createNoteFolder: (vaultPath: string, folderRelativePath: string) => Promise<string>
  renameNoteItem: (oldPath: string, newPath: string) => Promise<string>
  deleteNoteItem: (targetPath: string) => Promise<boolean>
  deleteVaultItem: (targetPath: string) => Promise<boolean>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  writeBinaryFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
  copyFile: (srcPath: string, destPath: string) => Promise<boolean>
  generateFlashcards: (
    notes: { name: string; content: string }[],
    apiKey: string
  ) => Promise<{ front: string; back: string }[]>
  preChaosStart: () => Promise<{ ok: boolean; online: boolean; endpoint: string }>
  preChaosState: () => Promise<{
    online: boolean
    endpoint: string
    reason?: string
    pythonPath?: string
    logs?: string[]
  }>
  preChaosLog: (message: string) => Promise<{ ok: boolean }>
  preChaosPredict: (
    events: PreChaosRawEvent[],
    sessionId: string,
    userId?: string
  ) => Promise<{
    risk: number
    status: 'low' | 'medium' | 'high'
    state: 'focused' | 'reflective' | 'steady' | 'distracted' | 'fatigued' | 'overloaded' | 'uncertain'
    confidence: number
    confidence_score: number
    authority_label: string
    focus_score: number
    fatigue_score: number
    distraction_score: number
    reflection_score: number
    uncertainty_score: number
    insights: string[]
    dominant_signals: Array<{ feature: string; score: number }>
    attention: number[]
    model_risk: number
    correction_factor: number
    baseline_ready: boolean
    mode: string
    context_summary: string
    page_explanation: string
  }>
  preChaosFeedback: (payload: {
    userId?: string
    label: 'focused' | 'thinking' | 'distracted' | 'tired'
    risk: number
  }) => Promise<{ correction_factor: number }>
  preChaosBaseline: (payload?: {
    userId?: string
    sessionId?: string
    sessionStartedAt?: number | null
    events?: PreChaosRawEvent[]
  }) => Promise<{
    user_id: string
    samples_seen: number
    feature_names: string[]
    baseline: {
      mean: number[]
      std: number[]
    }
    correction_factors: number[]
    mode: string
  }>
  preChaosCollect: (payload: {
    userId?: string
    sessionId: string
    sessionStartedAt?: number | null
    writeToDataset: boolean
    predict?: boolean
    requestId?: string
    events: PreChaosRawEvent[]
  }) => Promise<{
    requestId: string
    appended_samples: number
    appended_events: number
    ready_for_training: boolean
    prediction?: {
      risk: number
      status: 'low' | 'medium' | 'high'
      state: 'focused' | 'reflective' | 'steady' | 'distracted' | 'fatigued' | 'overloaded' | 'uncertain'
      confidence: number
      confidence_score: number
      authority_label: string
      focus_score: number
      fatigue_score: number
      distraction_score: number
      reflection_score: number
      uncertainty_score: number
      insights: string[]
      dominant_signals: Array<{ feature: string; score: number }>
      attention: number[]
      model_risk: number
      correction_factor: number
      baseline_ready: boolean
      mode: string
      context_summary: string
      page_explanation: string
    } | null
  }>
  preChaosDatasetStatus: () => Promise<{
    sample_count: number
    session_count: number
    ready_for_training: boolean
    mode: string
    last_trained_at?: string | null
    dataset_path: string
  }>
  preChaosTrainLive: () => Promise<{
    model_path: string
    scaler_path: string
    metrics: Record<string, unknown>
    mode: string
  }>
  preChaosDailyRhythm: (payload?: { userId?: string }) => Promise<{
    available: boolean
    session_count: number
    current_hour: number
    peak_hour: number | null
    hours: Array<{
      hour: number
      avg_focus_score: number
      sample_count: number
      enough_data: boolean
    }>
  }>
  preChaosSessionReplays: () => Promise<
    Array<{
      session_id: string
      user_id: string
      started_at: number
      ended_at: number
      duration_seconds: number
      sample_count: number
      avg_risk: number
      max_risk: number
      top_route: string
      state_summary: string
      timeline: Array<{
        timestamp: number
        risk: number
        state: 'focused' | 'reflective' | 'steady' | 'distracted' | 'fatigued' | 'overloaded' | 'uncertain'
        route: string
      }>
    }>
  >
  preChaosCameraModuleOpen: () => Promise<CameraModuleSnapshot>
  preChaosCameraModuleClose: () => Promise<CameraModuleSnapshot>
  preChaosCameraModuleState: () => Promise<CameraModuleSnapshot>
  preChaosCameraModuleSetMode: (mode: CameraModuleMode) => Promise<CameraModuleSnapshot>
  preChaosCameraModuleSync: (payload: Partial<CameraModuleSnapshot>) => void
  onPreChaosCameraModuleState: (listener: (payload: CameraModuleSnapshot) => void) => () => void
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
