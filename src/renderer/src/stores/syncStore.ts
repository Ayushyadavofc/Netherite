import { ID, Permission, Query, Role } from 'appwrite'
import { create } from 'zustand'

import { SNAPSHOTS_BUCKET_ID, storage } from '@/lib/appwrite'
import type { ElectronSyncProgressPayload } from '@/electron'
import {
  getDeviceVaultSnapshot,
  setDeviceVaultSnapshot
} from '@/hooks/use-data'
import {
  acknowledgeVaultEntry,
  createVaultSnapshotEntry,
  getUploadedFileIdFromUnsupportedSyncBackendError,
  getLatestVaultSnapshotEntry,
  isUnsupportedSyncBackendError,
  listVaultSnapshotEntries,
  syncCurrentDeviceRegistration
} from '@/lib/sync-server'
import { useAuthStore } from '@/stores/authStore'
import {
  buildVaultSnapshotFileName,
  isLegacyVaultSnapshotFileName,
  parseVaultSnapshotFileName
} from '../../../shared/snapshot-files'

type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'done' | 'error'
type SyncProgressDetails = {
  currentBytes: number
  totalBytes: number
  percent: number
}
type SyncProgressUpdate = {
  message: string
  details?: SyncProgressDetails | null
}

type SyncTarget = {
  vaultId: string
  path: string
  label?: string
}

type SyncVaultOptions = {
  silent?: boolean
  reportProgress?: (update: SyncProgressUpdate) => void
}

type RemoteVaultSnapshotDescriptor = {
  id: string
  snapshotAt: string
  snapshotName: string
}

type PreparedVaultUpload = {
  uploadedAt: string
  snapshotName: string
  zipPath: string
}

type VaultUpdateCheckResult = {
  hasUpdate: boolean
  remoteSnapshot: RemoteVaultSnapshotDescriptor | null
}

type SyncStore = {
  isSyncing: boolean
  isSyncModalOpen: boolean
  syncStatus: SyncStatus
  progress: string
  progressDetails: SyncProgressDetails | null
  errorMessage: string | null
  setSyncModalOpen: (open: boolean) => void
  uploadSnapshot: (vaultPath: string, vaultId: string) => Promise<void>
  uploadAccountData: () => Promise<void>
  restoreAccountData: () => Promise<boolean>
  restoreSnapshot: (vaultId: string, targetPath: string) => Promise<boolean>
  syncVault: (vaultPath: string, vaultId: string) => Promise<{ updated: string[]; added: string[] } | null>
  syncVaultSilently: (vaultPath: string, vaultId: string) => Promise<{ updated: string[]; added: string[] } | null>
  checkVaultUpdate: (vaultId: string) => Promise<VaultUpdateCheckResult>
  syncAllVaults: (vaults: SyncTarget[]) => Promise<{ synced: number; failed: number; skipped: number }>
  reconcileServerVaults: () => Promise<void>
  clearSyncState: () => void
}

const getCurrentUserId = () => useAuthStore.getState().user?.$id ?? null

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

const snapshotFileName = (id: string) => `${id}.zip`

const ACCOUNT_SNAPSHOT_ID = '__account_data__'
const SYNC_LOOKUP_TIMEOUT_MS = 15000

const createProgressUpdate = (message: string, details: SyncProgressDetails | null = null): SyncProgressUpdate => ({
  message,
  details
})

const createUploadProgressUpdate = (message: string, totalBytes: number, percent: number): SyncProgressUpdate => {
  const clampedPercent = Math.max(0, Math.min(100, percent))
  return {
    message: `${message} ${Math.round(clampedPercent)}%`,
    details: {
      currentBytes: Math.round((totalBytes * clampedPercent) / 100),
      totalBytes,
      percent: clampedPercent
    }
  }
}

const getVaultNameFromPath = (vaultPath: string) => {
  return vaultPath.split(/[\\/]/).filter(Boolean).pop() || 'Vault'
}

const createByteProgressUpdate = (
  message: string,
  currentBytes: number,
  totalBytes: number
): SyncProgressUpdate => {
  const safeTotal = Math.max(totalBytes, 0)
  const safeCurrent = Math.min(Math.max(currentBytes, 0), safeTotal || Math.max(currentBytes, 0))
  const percent = safeTotal > 0 ? (safeCurrent / safeTotal) * 100 : 0

  return {
    message,
    details: safeTotal > 0
      ? {
          currentBytes: safeCurrent,
          totalBytes: safeTotal,
          percent
        }
      : null
  }
}

const mapNativeProgressUpdate = (payload: ElectronSyncProgressPayload): SyncProgressUpdate => {
  if (
    typeof payload.currentBytes === 'number' &&
    typeof payload.totalBytes === 'number' &&
    payload.totalBytes > 0
  ) {
    return createByteProgressUpdate(payload.message, payload.currentBytes, payload.totalBytes)
  }

  return createProgressUpdate(payload.message)
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number, timeoutMessage: string) => {
  let timeoutId: number | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}

const getVaultSnapshotTimestamp = (snapshotAt?: string | null, snapshotName?: string | null) => {
  const parsedFromName = snapshotName ? parseVaultSnapshotFileName(snapshotName) : null
  const candidate = snapshotAt ?? parsedFromName?.snapshotAt ?? null
  const parsed = candidate ? Date.parse(candidate) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

const resolveRemoteSnapshotDescriptor = (
  vaultId: string,
  snapshotEntry: Awaited<ReturnType<typeof getLatestVaultSnapshotEntry>>,
  legacySnapshotFile: Awaited<ReturnType<typeof findLatestSnapshotFile>>
): RemoteVaultSnapshotDescriptor | null => {
  if (snapshotEntry?.$id) {
    return {
      id: snapshotEntry.$id,
      snapshotAt: snapshotEntry.uploadedAt ?? snapshotEntry.$createdAt,
      snapshotName: snapshotEntry.snapshotName ?? `${vaultId}.zip`
    }
  }

  if (legacySnapshotFile?.$id) {
    const parsed = parseVaultSnapshotFileName(legacySnapshotFile.name)
    return {
      id: legacySnapshotFile.$id,
      snapshotAt: parsed?.snapshotAt ?? legacySnapshotFile.$createdAt,
      snapshotName: legacySnapshotFile.name
    }
  }

  return null
}

const isRemoteSnapshotNewer = (vaultId: string, remoteSnapshot: RemoteVaultSnapshotDescriptor | null) => {
  if (!remoteSnapshot) {
    return false
  }

  const localSnapshot = getDeviceVaultSnapshot(vaultId)
  const localTimestamp = getVaultSnapshotTimestamp(localSnapshot?.snapshotAt, localSnapshot?.snapshotName)
  const remoteTimestamp = getVaultSnapshotTimestamp(remoteSnapshot.snapshotAt, remoteSnapshot.snapshotName)

  if (remoteTimestamp === null) {
    return false
  }

  if (localTimestamp === null) {
    return true
  }

  if (remoteTimestamp > localTimestamp) {
    return true
  }

  return remoteTimestamp === localTimestamp && remoteSnapshot.snapshotName !== localSnapshot?.snapshotName
}

const markDeviceVaultSnapshot = (vaultId: string, snapshot: RemoteVaultSnapshotDescriptor | null) => {
  if (!snapshot) {
    return
  }

  setDeviceVaultSnapshot(vaultId, {
    snapshotAt: snapshot.snapshotAt,
    snapshotName: snapshot.snapshotName
  })
}

const listenForNativeSyncProgress = (reportProgress: (update: SyncProgressUpdate) => void) => {
  return window.electronAPI.onSyncProgress((payload) => {
    reportProgress(mapNativeProgressUpdate(payload))
  })
}

async function findLatestSnapshotFile(snapshotId: string) {
  try {
    const result = await storage.listFiles(SNAPSHOTS_BUCKET_ID, [
      Query.orderDesc('$createdAt'),
      Query.limit(100)
    ])
    return (
      result.files.find((file) => {
        const parsed = parseVaultSnapshotFileName(file.name)
        return parsed?.vaultId === snapshotId || isLegacyVaultSnapshotFileName(file.name, snapshotId)
      }) ?? null
    )
  } catch {
    return null
  }
}

async function deleteExistingSnapshots(snapshotId: string, keepFileId?: string) {
  try {
    const result = await storage.listFiles(SNAPSHOTS_BUCKET_ID, [
      Query.orderDesc('$createdAt'),
      Query.limit(100)
    ])
    for (const file of result.files) {
      const parsed = parseVaultSnapshotFileName(file.name)
      const matchesSnapshot =
        parsed?.vaultId === snapshotId || isLegacyVaultSnapshotFileName(file.name, snapshotId)

      if (!matchesSnapshot) {
        continue
      }

      if (keepFileId && file.$id === keepFileId) {
        continue
      }
      await storage.deleteFile(SNAPSHOTS_BUCKET_ID, file.$id).catch(() => undefined)
    }
  } catch {
    // Non-fatal
  }
}

async function readTempZipAsFile(zipPath: string, fileName: string) {
  const zipBytes = await window.electronAPI.readBinaryFile(zipPath)
  const zipBuffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength
  ) as ArrayBuffer

  return new File([zipBuffer], fileName, { type: 'application/zip' })
}

async function downloadVaultEntryToTemp(
  entryId: string,
  tempFileName: string,
  reportProgress?: (update: SyncProgressUpdate) => void,
  message = 'Downloading snapshot...'
) {
  const downloadUrl = storage.getFileDownload(SNAPSHOTS_BUCKET_ID, entryId)
  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`)
  }

  const totalBytes = Number(response.headers.get('content-length') ?? '0')
  const reader = response.body?.getReader()

  if (!reader) {
    const zipBuffer = await response.arrayBuffer()
    if (reportProgress && totalBytes > 0) {
      reportProgress(createByteProgressUpdate(message, zipBuffer.byteLength, totalBytes))
    }
    return window.electronAPI.writeTempFile(tempFileName, zipBuffer)
  }

  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    if (!value) {
      continue
    }

    chunks.push(value)
    receivedBytes += value.byteLength

    if (reportProgress && totalBytes > 0) {
      reportProgress(createByteProgressUpdate(message, receivedBytes, totalBytes))
    } else if (reportProgress) {
      reportProgress(createProgressUpdate(`${message} ${Math.max(receivedBytes / (1024 * 1024), 0).toFixed(1)} MB`))
    }
  }

  const zipBytes = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    zipBytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  if (reportProgress && totalBytes > 0) {
    reportProgress(createByteProgressUpdate(message, receivedBytes, totalBytes))
  }

  return window.electronAPI.writeTempFile(tempFileName, zipBytes.buffer)
}

async function cleanupProcessedVaultSnapshot(
  snapshotEntry: Awaited<ReturnType<typeof getLatestVaultSnapshotEntry>>,
  legacySnapshotFile: Awaited<ReturnType<typeof findLatestSnapshotFile>>,
  registeredDeviceIds: string[]
) {
  if (snapshotEntry) {
    await acknowledgeVaultEntry(snapshotEntry, registeredDeviceIds)
    return
  }

  if (legacySnapshotFile) {
    await storage.deleteFile(SNAPSHOTS_BUCKET_ID, legacySnapshotFile.$id).catch(() => undefined)
  }
}

async function getRemoteVaultSnapshotState(userId: string, vaultId: string) {
  const [registeredDeviceIds, snapshotEntry] = await withTimeout(
    Promise.all([
      syncCurrentDeviceRegistration(userId),
      getLatestVaultSnapshotEntry(vaultId)
    ]),
    SYNC_LOOKUP_TIMEOUT_MS,
    'Sync lookup timed out while checking for the latest vault snapshot.'
  )

  const legacySnapshotFile = snapshotEntry
    ? null
    : await withTimeout(
        findLatestSnapshotFile(vaultId),
        SYNC_LOOKUP_TIMEOUT_MS,
        'Sync lookup timed out while checking legacy vault snapshots.'
      )

  return {
    registeredDeviceIds,
    snapshotEntry,
    legacySnapshotFile
  }
}

async function prepareVaultUpload(
  userId: string,
  vaultPath: string,
  vaultId: string,
  reportProgress: (update: SyncProgressUpdate) => void
): Promise<PreparedVaultUpload> {
  const uploadedAt = new Date().toISOString()
  const snapshotName = buildVaultSnapshotFileName({
    timestamp: uploadedAt,
    vaultName: getVaultNameFromPath(vaultPath),
    ownerId: userId,
    vaultId
  })
  const unsubscribe = listenForNativeSyncProgress(reportProgress)
  try {
    const zipPath = await window.electronAPI.zipVault(vaultPath)
    return {
      uploadedAt,
      snapshotName,
      zipPath
    }
  } finally {
    unsubscribe()
  }
}

async function uploadPreparedVaultSnapshot(
  userId: string,
  vaultId: string,
  prepared: PreparedVaultUpload,
  reportProgress: (update: SyncProgressUpdate) => void
) {
  reportProgress(createProgressUpdate('Preparing upload...'))
  const zipFile = await readTempZipAsFile(prepared.zipPath, prepared.snapshotName)

  reportProgress(createProgressUpdate('Uploading vault...'))
  const createdEntry = await createVaultSnapshotEntry(userId, vaultId, zipFile, (progress) => {
    reportProgress(createUploadProgressUpdate('Uploading vault...', zipFile.size, progress))
  }, prepared.uploadedAt)

  markDeviceVaultSnapshot(vaultId, {
    id: createdEntry.$id,
    snapshotAt: createdEntry.uploadedAt ?? prepared.uploadedAt,
    snapshotName: prepared.snapshotName
  })
}

async function uploadPreparedLegacyVaultSnapshot(
  userId: string,
  vaultId: string,
  prepared: PreparedVaultUpload,
  reportProgress: (update: SyncProgressUpdate) => void
) {
  reportProgress(createProgressUpdate('Preparing upload...'))
  const zipFile = await readTempZipAsFile(prepared.zipPath, prepared.snapshotName)

  reportProgress(createProgressUpdate('Uploading vault...'))
  const permissions = [
    Permission.read(Role.user(userId)),
    Permission.write(Role.user(userId))
  ]
  const uploadedFile = await storage.createFile(
    SNAPSHOTS_BUCKET_ID,
    ID.unique(),
    zipFile,
    permissions,
    (progressEvent) => {
      reportProgress(createUploadProgressUpdate('Uploading vault...', zipFile.size, progressEvent.progress))
    }
  )

  reportProgress(createProgressUpdate('Cleaning up previous vault snapshot...'))
  await deleteExistingSnapshots(vaultId, uploadedFile.$id)

  markDeviceVaultSnapshot(vaultId, {
    id: uploadedFile.$id,
    snapshotAt: prepared.uploadedAt,
    snapshotName: prepared.snapshotName
  })
}

async function finalizeLegacySnapshotRetention(
  snapshotId: string,
  uploadedFileId: string,
  reportProgress: (update: SyncProgressUpdate) => void
) {
  reportProgress(createProgressUpdate('Cleaning up previous vault snapshot...'))
  await deleteExistingSnapshots(snapshotId, uploadedFileId)
  await window.electronAPI.clearTemp()
}

const applyProgressUpdate = (
  setState: (partial: Partial<SyncStore>) => void,
  update: SyncProgressUpdate,
  prefix?: string
) => {
  setState({
    progress: prefix ? `${prefix}: ${update.message}` : update.message,
    progressDetails: update.details ?? null
  })
}

async function syncVaultFromServer(
  userId: string,
  vaultPath: string,
  vaultId: string,
  options?: SyncVaultOptions
) {
  options?.reportProgress?.(createProgressUpdate('Checking for updates...'))
  const { registeredDeviceIds, snapshotEntry, legacySnapshotFile } = await getRemoteVaultSnapshotState(
    userId,
    vaultId
  )
  const remoteSnapshot = resolveRemoteSnapshotDescriptor(vaultId, snapshotEntry, legacySnapshotFile)
  if (!remoteSnapshot) {
    return null
  }

  options?.reportProgress?.(createProgressUpdate('Downloading latest snapshot...'))
  const tempZipPath = await downloadVaultEntryToTemp(
    remoteSnapshot.id,
    `sync-${vaultId}-${Date.now()}.zip`,
    options?.reportProgress,
    'Downloading latest snapshot...'
  )

  const unsubscribe = options?.reportProgress
    ? listenForNativeSyncProgress(options.reportProgress)
    : null
  let result: { updated: string[]; added: string[] }
  try {
    result = await window.electronAPI.mergeVaultFromZip(vaultPath, tempZipPath)
  } finally {
    unsubscribe?.()
  }
  await window.electronAPI.clearTemp()
  await cleanupProcessedVaultSnapshot(snapshotEntry, legacySnapshotFile, registeredDeviceIds)
  markDeviceVaultSnapshot(vaultId, remoteSnapshot)

  return result
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  isSyncing: false,
  isSyncModalOpen: false,
  syncStatus: 'idle',
  progress: '',
  progressDetails: null,
  errorMessage: null,

  setSyncModalOpen: (open) => {
    set({ isSyncModalOpen: open })
  },

  clearSyncState: () => {
    set({
      isSyncing: false,
      syncStatus: 'idle',
      progress: '',
      progressDetails: null,
      errorMessage: null
    })
  },

  uploadSnapshot: async (vaultPath, vaultId) => {
    const userId = getCurrentUserId()
    if (!userId) {
      set({ syncStatus: 'error', errorMessage: 'Login required to sync.', isSyncing: false })
      return
    }

    set({
      isSyncing: true,
      syncStatus: 'uploading',
      progress: 'Preparing vault...',
      progressDetails: null,
      errorMessage: null
    })

    try {
      const prepared = await prepareVaultUpload(userId, vaultPath, vaultId, (update) => {
        applyProgressUpdate(set, update)
      })

      try {
        await uploadPreparedVaultSnapshot(userId, vaultId, prepared, (update) => {
          applyProgressUpdate(set, update)
        })
      } catch (error) {
        if (!isUnsupportedSyncBackendError(error)) {
          throw error
        }

        const uploadedFileId = getUploadedFileIdFromUnsupportedSyncBackendError(error)
        if (uploadedFileId) {
          await finalizeLegacySnapshotRetention(vaultId, uploadedFileId, (update) => {
            applyProgressUpdate(set, update)
          })
        } else {
          await uploadPreparedLegacyVaultSnapshot(userId, vaultId, prepared, (update) => {
            applyProgressUpdate(set, update)
          })
        }
      }

      set({ isSyncing: false, syncStatus: 'done', progress: 'Sync complete', progressDetails: null, errorMessage: null })
    } catch (error) {
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: getErrorMessage(error, 'Sync upload failed.')
      })
    } finally {
      await window.electronAPI.clearTemp().catch(() => undefined)
    }
  },

  uploadAccountData: async () => {
    const userId = getCurrentUserId()
    if (!userId) {
      set({ syncStatus: 'error', errorMessage: 'Login required to sync.', isSyncing: false })
      return
    }

    set({
      isSyncing: true,
      syncStatus: 'uploading',
      progress: 'Preparing account data...',
      progressDetails: null,
      errorMessage: null
    })

    try {
      const unsubscribe = listenForNativeSyncProgress((update) => {
        applyProgressUpdate(set, update)
      })
      let zipPath = ''
      try {
        zipPath = await window.electronAPI.zipAccountData(userId)
      } finally {
        unsubscribe()
      }
      const zipFile = await readTempZipAsFile(zipPath, snapshotFileName(ACCOUNT_SNAPSHOT_ID))

      set({ progress: 'Uploading account data...', progressDetails: null })
      const permissions = [
        Permission.read(Role.user(userId)),
        Permission.write(Role.user(userId))
      ]
      const uploadedFile = await storage.createFile(
        SNAPSHOTS_BUCKET_ID,
        ID.unique(),
        zipFile,
        permissions,
        (progressEvent) => {
          applyProgressUpdate(set, createUploadProgressUpdate('Uploading account data...', zipFile.size, progressEvent.progress))
        }
      )

      set({ progress: 'Cleaning up old snapshots...', progressDetails: null })
      await deleteExistingSnapshots(ACCOUNT_SNAPSHOT_ID, uploadedFile.$id)

      await window.electronAPI.clearTemp()

      set({ isSyncing: false, syncStatus: 'done', progress: 'Account sync complete', progressDetails: null, errorMessage: null })
    } catch (error) {
      await window.electronAPI.clearTemp().catch(() => undefined)
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: getErrorMessage(error, 'Account data sync failed.')
      })
    }
  },

  restoreAccountData: async () => {
    const userId = getCurrentUserId()
    if (!userId || get().isSyncing) {
      return false
    }

    set({
      isSyncing: true,
      syncStatus: 'downloading',
      progress: 'Checking for account data...',
      progressDetails: null,
      errorMessage: null
    })

    try {
      const snapshotFile = await findLatestSnapshotFile(ACCOUNT_SNAPSHOT_ID)
      if (!snapshotFile) {
        set({ isSyncing: false, syncStatus: 'idle', progress: '', progressDetails: null })
        return false
      }

      const tempZipPath = await downloadVaultEntryToTemp(
        snapshotFile.$id,
        `account-restore-${Date.now()}.zip`,
        (update) => {
          applyProgressUpdate(set, update)
        },
        'Downloading account data...'
      )

      const unsubscribe = listenForNativeSyncProgress((update) => {
        applyProgressUpdate(set, update)
      })
      try {
        await window.electronAPI.unzipAccountData(userId, tempZipPath)
      } finally {
        unsubscribe()
      }
      await window.electronAPI.clearTemp()

      set({ isSyncing: false, syncStatus: 'done', progress: 'Account data restored', progressDetails: null, errorMessage: null })
      return true
    } catch (error) {
      await window.electronAPI.clearTemp().catch(() => undefined)
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: getErrorMessage(error, 'Account data restore failed.')
      })
      return false
    }
  },

  restoreSnapshot: async (vaultId, targetPath) => {
    const userId = getCurrentUserId()
    if (!userId || get().isSyncing) {
      return false
    }

    set({
      isSyncing: true,
      syncStatus: 'downloading',
      progress: 'Checking for snapshot...',
      progressDetails: null,
      errorMessage: null
    })

    try {
      const { registeredDeviceIds, snapshotEntry, legacySnapshotFile } = await getRemoteVaultSnapshotState(
        userId,
        vaultId
      )
      const remoteSnapshot = resolveRemoteSnapshotDescriptor(vaultId, snapshotEntry, legacySnapshotFile)
      if (!remoteSnapshot) {
        set({ isSyncing: false, syncStatus: 'idle', progress: '', progressDetails: null })
        return false
      }

      const tempZipPath = await downloadVaultEntryToTemp(
        remoteSnapshot.id,
        `restore-${vaultId}-${Date.now()}.zip`,
        (update) => {
          applyProgressUpdate(set, update)
        },
        'Downloading latest snapshot...'
      )

      const unsubscribe = listenForNativeSyncProgress((update) => {
        applyProgressUpdate(set, update)
      })
      try {
        await window.electronAPI.unzipVault(tempZipPath, targetPath)
      } finally {
        unsubscribe()
      }
      await window.electronAPI.clearTemp()
      await cleanupProcessedVaultSnapshot(snapshotEntry, legacySnapshotFile, registeredDeviceIds)
      markDeviceVaultSnapshot(vaultId, remoteSnapshot)

      set({ isSyncing: false, syncStatus: 'done', progress: 'Restore complete', progressDetails: null, errorMessage: null })
      return true
    } catch (error) {
      await window.electronAPI.clearTemp().catch(() => undefined)
      const message = getErrorMessage(error, 'Restore from cloud failed.')
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: message
      })
      throw new Error(message)
    }
  },

  syncVault: async (vaultPath, vaultId) => {
    const userId = getCurrentUserId()
    if (!userId || get().isSyncing) {
      return null
    }

    set({
      isSyncing: true,
      syncStatus: 'downloading',
      progress: 'Checking for updates...',
      progressDetails: null,
      errorMessage: null
    })

    try {
      const result = await syncVaultFromServer(userId, vaultPath, vaultId, {
        reportProgress: (update) => {
          applyProgressUpdate(set, update)
        }
      })
      if (!result) {
        set({ isSyncing: false, syncStatus: 'idle', progress: '', progressDetails: null })
        return null
      }

      const totalChanged = result.updated.length + result.added.length
      const statusMessage = totalChanged > 0
        ? `Synced ${totalChanged} file${totalChanged > 1 ? 's' : ''}`
        : 'Already up to date'

      set({ isSyncing: false, syncStatus: 'done', progress: statusMessage, progressDetails: null, errorMessage: null })
      return result
    } catch (error) {
      await window.electronAPI.clearTemp().catch(() => undefined)
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: getErrorMessage(error, 'Sync failed.')
      })
      return null
    }
  },

  syncVaultSilently: async (vaultPath, vaultId) => {
    const userId = getCurrentUserId()
    if (!userId || get().isSyncing) {
      return null
    }

    try {
      return await syncVaultFromServer(userId, vaultPath, vaultId, { silent: true })
    } catch (error) {
      await window.electronAPI.clearTemp().catch(() => undefined)
      console.warn(`Background sync failed for vault ${vaultId}:`, error)
      return null
    }
  },

  checkVaultUpdate: async (vaultId) => {
    const userId = getCurrentUserId()
    if (!userId) {
      return { hasUpdate: false, remoteSnapshot: null }
    }

    try {
      const { snapshotEntry, legacySnapshotFile } = await getRemoteVaultSnapshotState(userId, vaultId)
      const remoteSnapshot = resolveRemoteSnapshotDescriptor(vaultId, snapshotEntry, legacySnapshotFile)
      return {
        hasUpdate: isRemoteSnapshotNewer(vaultId, remoteSnapshot),
        remoteSnapshot
      }
    } catch {
      return { hasUpdate: false, remoteSnapshot: null }
    }
  },

  syncAllVaults: async (vaults) => {
    const userId = getCurrentUserId()
    if (!userId) {
      set({ syncStatus: 'error', errorMessage: 'Login required to sync.', isSyncing: false })
      return { synced: 0, failed: 0, skipped: vaults.length }
    }

    const syncTargets = vaults.filter((vault) => vault.vaultId.trim().length > 0 && vault.path.trim().length > 0)
    const skipped = vaults.length - syncTargets.length

    if (syncTargets.length === 0) {
      set({
        isSyncing: false,
        syncStatus: 'idle',
        progress: '',
        progressDetails: null,
        errorMessage: null
      })
      return { synced: 0, failed: 0, skipped }
    }

    set({
      isSyncing: true,
      syncStatus: 'uploading',
      progress: 'Preparing vaults...',
      progressDetails: null,
      errorMessage: null
    })

    let synced = 0
    let failed = 0
    let firstError: string | null = null

    for (let index = 0; index < syncTargets.length; index += 1) {
      const vault = syncTargets[index]
      const prefix = `${vault.label || `Vault ${index + 1}`} (${index + 1}/${syncTargets.length})`

      try {
        const prepared = await prepareVaultUpload(userId, vault.path, vault.vaultId, (update) => {
          applyProgressUpdate(set, update, prefix)
        })

        try {
          await uploadPreparedVaultSnapshot(userId, vault.vaultId, prepared, (update) => {
            applyProgressUpdate(set, update, prefix)
          })
        } catch (error) {
          if (!isUnsupportedSyncBackendError(error)) {
            throw error
          }

          const uploadedFileId = getUploadedFileIdFromUnsupportedSyncBackendError(error)
          if (uploadedFileId) {
            await finalizeLegacySnapshotRetention(vault.vaultId, uploadedFileId, (update) => {
              applyProgressUpdate(set, update, prefix)
            })
          } else {
            await uploadPreparedLegacyVaultSnapshot(userId, vault.vaultId, prepared, (update) => {
              applyProgressUpdate(set, update, prefix)
            })
          }
        }
        synced += 1
      } catch (error) {
        failed += 1
        firstError ??= `${prefix}: ${getErrorMessage(error, 'Sync failed.')}`
      } finally {
        await window.electronAPI.clearTemp().catch(() => undefined)
      }
    }

    if (failed > 0) {
      set({
        isSyncing: false,
        syncStatus: 'error',
        progress: '',
        progressDetails: null,
        errorMessage: firstError ?? `Synced ${synced} vaults, ${failed} failed.`
      })
    } else {
      set({
        isSyncing: false,
        syncStatus: 'done',
        progress: `Synced ${synced} vault${synced === 1 ? '' : 's'}`,
        progressDetails: null,
        errorMessage: null
      })
    }

    return { synced, failed, skipped }
  },

  reconcileServerVaults: async () => {
    const userId = getCurrentUserId()
    if (!userId) {
      return
    }

    try {
      await syncCurrentDeviceRegistration(userId)
    } catch (error) {
      console.warn('Vault reconciliation failed:', error)
    }
  }
}))
