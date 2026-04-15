import { contextBridge, ipcRenderer } from 'electron'
import { createEmptyRuntimeConfig, type RuntimeAppConfig } from '../shared/runtime-config'
import type { CameraModuleMode, CameraModuleSnapshot } from '../renderer/src/prechaos/types'

const runtimeConfig = (() => {
  try {
    return ipcRenderer.sendSync('app:getRuntimeConfigSync') as RuntimeAppConfig
  } catch {
    return createEmptyRuntimeConfig()
  }
})()

const appLaunchId = (() => {
  try {
    return ipcRenderer.sendSync('app:getLaunchIdSync') as string
  } catch {
    return 'unknown-launch'
  }
})()

const characterAssetRoot = (() => {
  try {
    return ipcRenderer.sendSync('app:getCharacterAssetRootSync') as string
  } catch {
    return ''
  }
})()

contextBridge.exposeInMainWorld('electronAPI', {
  runtimeConfig,
  appLaunchId,
  characterAssetRoot,
  appLog: (message: string) => ipcRenderer.invoke('app:log', message),
  // Account data: lets the signed-in renderer load and persist per-user JSON files.
  readAccountFile: <T = unknown>(userId: string, filename: string) =>
    ipcRenderer.invoke('readAccountFile', userId, filename) as Promise<T | null>,
  writeAccountFile: <T = unknown>(userId: string, filename: string, data: T) =>
    ipcRenderer.invoke('writeAccountFile', userId, filename, data) as Promise<T>,
  migrateGuestData: (userId: string) => ipcRenderer.invoke('migrateGuestData', userId),

  // Sync/transfer helpers: restricted in the main process to temp storage or known vault paths.
  zipAccountData: (userId: string) => ipcRenderer.invoke('zipAccountData', userId),
  zipVault: (vaultPath: string) => ipcRenderer.invoke('zipVault', vaultPath),
  unzipAccountData: (userId: string, zipPath: string) =>
    ipcRenderer.invoke('unzipAccountData', userId, zipPath),
  unzipVault: (zipPath: string, targetPath: string) =>
    ipcRenderer.invoke('unzipVault', zipPath, targetPath),
  mergeVaultFromZip: (localVaultPath: string, zipPath: string) =>
    ipcRenderer.invoke('mergeVaultFromZip', localVaultPath, zipPath),
  clearTemp: () => ipcRenderer.invoke('clearTemp'),
  readBinaryFile: (filePath: string) => ipcRenderer.invoke('readBinaryFile', filePath),
  writeTempFile: (filename: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('writeTempFile', filename, data),
  onSyncProgress: (
    listener: (payload: {
      stage: 'checking' | 'zipping' | 'uploading' | 'downloading' | 'extracting' | 'applying'
      message: string
      currentBytes?: number
      totalBytes?: number
      percent?: number
    }) => void
  ) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      payload: {
        stage: 'checking' | 'zipping' | 'uploading' | 'downloading' | 'extracting' | 'applying'
        message: string
        currentBytes?: number
        totalBytes?: number
        percent?: number
      }
    ) => listener(payload)

    ipcRenderer.on('sync-progress', wrapped)
    return () => {
      ipcRenderer.removeListener('sync-progress', wrapped)
    }
  },

  // Vault lifecycle: each path is selected by the user or checked against known vault state in main.
  directoryExists: (dirPath: string) => ipcRenderer.invoke('directoryExists', dirPath),
  selectFolder: () => ipcRenderer.invoke('selectFolder'),
  activateVault: (vaultPath: string, options?: { readOnly?: boolean }) =>
    ipcRenderer.invoke('activateVault', vaultPath, options),
  createVault: (parentPath: string, vaultName: string, welcomeContent: string) =>
    ipcRenderer.invoke('createVault', parentPath, vaultName, welcomeContent),
  createVaultAtPath: (targetPath: string, welcomeContent: string) =>
    ipcRenderer.invoke('createVaultAtPath', targetPath, welcomeContent),
  initVault: (vaultPath: string, userId: string) => ipcRenderer.invoke('initVault', vaultPath, userId),
  checkVaultOwnership: (vaultPath: string, userId: string) =>
    ipcRenderer.invoke('checkVaultOwnership', vaultPath, userId),
  cloneVault: (sourcePath: string, userId: string) => ipcRenderer.invoke('cloneVault', sourcePath, userId),

  // Vault file access: main-process handlers enforce current/known vault boundaries for every path.
  readFolder: (dirPath: string, options?: { includeMarkdownContent?: boolean }) =>
    ipcRenderer.invoke('readFolder', dirPath, options),
  readFile: (filePath: string) => ipcRenderer.invoke('readFile', filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke('fileExists', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('writeFile', filePath, content),
  createFolder: (dirPath: string) => ipcRenderer.invoke('createFolder', dirPath),
  createNoteFolder: (vaultPath: string, folderRelativePath: string) =>
    ipcRenderer.invoke('createNoteFolder', vaultPath, folderRelativePath),
  renameNoteItem: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('renameNoteItem', oldPath, newPath),
  deleteNoteItem: (targetPath: string) =>
    ipcRenderer.invoke('deleteNoteItem', targetPath),
  deleteVaultItem: (targetPath: string) =>
    ipcRenderer.invoke('deleteVaultItem', targetPath),

  // Attachments/media: writes stay inside the active vault and imports require a user-picked source file.
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('selectFile', filters),
  writeBinaryFile: (filePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('writeBinaryFile', filePath, data),
  copyFile: (srcPath: string, destPath: string) =>
    ipcRenderer.invoke('copyFile', srcPath, destPath),

  // AI: Groq flashcard generation via main-process fetch (bypasses renderer CSP).
  generateFlashcards: (
    notes: { name: string; content: string }[],
    apiKey: string
  ) =>
    ipcRenderer.invoke('ai:generate', { notes, apiKey }) as Promise<
      { front: string; back: string }[]
    >,

  preChaosStart: () => ipcRenderer.invoke('prechaos:start'),
  preChaosState: () => ipcRenderer.invoke('prechaos:state'),
  preChaosLog: (message: string) => ipcRenderer.invoke('prechaos:log', message),
  preChaosPredict: (
    events: Array<Record<string, unknown>>,
    sessionId: string,
    userId?: string
  ) => ipcRenderer.invoke('prechaos:predict', { events, sessionId, userId }),
  preChaosFeedback: (payload: { userId?: string; label: 'focused' | 'thinking' | 'distracted' | 'tired'; risk: number }) =>
    ipcRenderer.invoke('prechaos:feedback', payload),
  preChaosBaseline: (payload?: { userId?: string; sessionId?: string; sessionStartedAt?: number | null; events?: Array<Record<string, unknown>> }) =>
    ipcRenderer.invoke('prechaos:baseline', payload),
  preChaosCollect: (payload: {
    userId?: string
    sessionId: string
    sessionStartedAt?: number | null
    writeToDataset: boolean
    predict?: boolean
    requestId?: string
    events: Array<Record<string, unknown>>
  }) => ipcRenderer.invoke('prechaos:collect', payload),
  preChaosDatasetStatus: () => ipcRenderer.invoke('prechaos:dataset-status'),
  preChaosTrainLive: () => ipcRenderer.invoke('prechaos:train-live'),
  preChaosSessionReplays: () => ipcRenderer.invoke('prechaos:session-replays'),
  preChaosDailyRhythm: (payload?: { userId?: string }) => ipcRenderer.invoke('prechaos:daily-rhythm', payload),
  preChaosCameraModuleOpen: () =>
    ipcRenderer.invoke('prechaos:camera-module-open') as Promise<CameraModuleSnapshot>,
  preChaosCameraModuleClose: () =>
    ipcRenderer.invoke('prechaos:camera-module-close') as Promise<CameraModuleSnapshot>,
  preChaosCameraModuleState: () =>
    ipcRenderer.invoke('prechaos:camera-module-state') as Promise<CameraModuleSnapshot>,
  preChaosCameraModuleSetMode: (mode: CameraModuleMode) =>
    ipcRenderer.invoke('prechaos:camera-module-set-mode', mode) as Promise<CameraModuleSnapshot>,
  preChaosCameraModuleSync: (payload: Partial<CameraModuleSnapshot>) =>
    ipcRenderer.send('prechaos:camera-module-sync', payload),
  onPreChaosCameraModuleState: (listener: (payload: CameraModuleSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: CameraModuleSnapshot) => listener(payload)

    ipcRenderer.on('prechaos:camera-module-snapshot', wrapped)
    return () => {
      ipcRenderer.removeListener('prechaos:camera-module-snapshot', wrapped)
    }
  },

  // Window controls: renderer needs these to drive the custom chrome buttons.
  getWindowBounds: () =>
    ipcRenderer.invoke('window-get-bounds') as Promise<{ x: number; y: number; width: number; height: number } | null>,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
})
