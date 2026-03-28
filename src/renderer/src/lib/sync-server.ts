import { ID, Models, Permission, Query, Role } from 'appwrite'

import {
  DATABASE_ID,
  SNAPSHOTS_BUCKET_ID,
  SYNC_MANIFESTS_COLLECTION_ID,
  VAULT_SNAPSHOTS_COLLECTION_ID,
  getAppwriteProjectId,
  databases,
  storage
} from '@/lib/appwrite'
import { parseVaultSnapshotFileName } from '../../../shared/snapshot-files'

const DEVICE_ID_KEY = 'netherite-device-id'
const STAY_SIGNED_IN_KEY = 'netherite-stay-signed-in'
const DEFAULT_STAY_SIGNED_IN = true
const SYNC_DEVICE_EVENT = 'netherite-sync-device-updated'
const DEFAULT_QUERY_LIMIT = 100
const SYNC_BACKEND_COOLDOWN_MS = 6 * 60 * 60 * 1000
const manifestBackendKey = `netherite-sync-manifest-backend-disabled:${getAppwriteProjectId()}`
const vaultMetadataBackendKey = `netherite-sync-vault-metadata-backend-disabled:${getAppwriteProjectId()}`

const isBackendDisabled = (key: string) => {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return false
    }

    const disabledAt = Number(raw)
    if (!Number.isFinite(disabledAt)) {
      window.localStorage.removeItem(key)
      return false
    }

    if (Date.now() - disabledAt < SYNC_BACKEND_COOLDOWN_MS) {
      return true
    }

    window.localStorage.removeItem(key)
    return false
  } catch {
    return false
  }
}

let manifestBackendUnavailable = isBackendDisabled(manifestBackendKey)
let vaultMetadataBackendUnavailable = isBackendDisabled(vaultMetadataBackendKey)

class UnsupportedSyncBackendError extends Error {
  uploadedFileId?: string

  constructor(message: string, options?: { uploadedFileId?: string }) {
    super(message)
    this.name = 'UnsupportedSyncBackendError'
    this.uploadedFileId = options?.uploadedFileId
  }
}

export type SyncManifestDocument = Models.Document & {
  userId?: string
  deviceIds?: string[]
  updatedAt?: string
}

export type VaultSnapshotDocument = Models.Document & {
  vaultId?: string
  uploadedAt?: string
  uploadedBy?: string
  checkedBy?: string[]
  snapshotUrl?: string
  snapshotName?: string
}

const buildDocumentPermissions = (userId: string) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId))
]

const buildStoragePermissions = (userId: string) => [
  Permission.read(Role.user(userId)),
  Permission.write(Role.user(userId))
]

const dedupeDeviceIds = (deviceIds: string[]) => {
  return Array.from(new Set(deviceIds.filter((deviceId) => deviceId.trim().length > 0)))
}

const createIsoTimestamp = () => new Date().toISOString()

const dispatchSyncDeviceEvent = () => {
  window.dispatchEvent(new Event(SYNC_DEVICE_EVENT))
}

const markManifestBackendUnavailable = () => {
  manifestBackendUnavailable = true
  try {
    window.localStorage.setItem(manifestBackendKey, String(Date.now()))
  } catch {
    // Ignore localStorage write failures.
  }
}

const markVaultMetadataBackendUnavailable = () => {
  vaultMetadataBackendUnavailable = true
  try {
    window.localStorage.setItem(vaultMetadataBackendKey, String(Date.now()))
  } catch {
    // Ignore localStorage write failures.
  }
}

export const getSyncDeviceEventName = () => SYNC_DEVICE_EVENT

export const getOrCreateDeviceId = () => {
  const existingDeviceId = window.localStorage.getItem(DEVICE_ID_KEY)?.trim()
  if (existingDeviceId) {
    return existingDeviceId
  }

  const nextDeviceId = crypto.randomUUID()
  window.localStorage.setItem(DEVICE_ID_KEY, nextDeviceId)
  dispatchSyncDeviceEvent()
  return nextDeviceId
}

export const isStaySignedInEnabled = () => {
  const raw = window.localStorage.getItem(STAY_SIGNED_IN_KEY)
  if (raw === null) {
    return DEFAULT_STAY_SIGNED_IN
  }

  return raw === 'true'
}

export const setStaySignedInEnabled = (enabled: boolean) => {
  window.localStorage.setItem(STAY_SIGNED_IN_KEY, String(enabled))
  dispatchSyncDeviceEvent()
}

const isSyncBackendRequestError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : undefined
  return code === 400 || code === 404
}

const asUnsupportedSyncBackendError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof UnsupportedSyncBackendError) {
    return error
  }

  if (isSyncBackendRequestError(error)) {
    return new UnsupportedSyncBackendError(fallbackMessage)
  }

  return null
}

async function getSyncManifest(userId: string) {
  try {
    return (await databases.getDocument(
      DATABASE_ID,
      SYNC_MANIFESTS_COLLECTION_ID,
      userId
    )) as SyncManifestDocument
  } catch (error) {
    if (isSyncBackendRequestError(error)) {
      markManifestBackendUnavailable()
    }
    return null
  }
}

async function createSyncManifest(userId: string) {
  return (await databases.createDocument(
    DATABASE_ID,
    SYNC_MANIFESTS_COLLECTION_ID,
    userId,
    {
      userId,
      deviceIds: [],
      updatedAt: createIsoTimestamp()
    },
    buildDocumentPermissions(userId)
  )) as SyncManifestDocument
}

export async function ensureSyncManifest(userId: string) {
  if (manifestBackendUnavailable) {
    return null
  }

  const existingManifest = await getSyncManifest(userId)
  if (existingManifest) {
    return existingManifest
  }

  try {
    return await createSyncManifest(userId)
  } catch (error) {
    const afterCreateRace = await getSyncManifest(userId)
    if (afterCreateRace) {
      return afterCreateRace
    }

    const unsupportedError = asUnsupportedSyncBackendError(
      error,
      'Sync manifest backend is not available for this account.'
    )
    if (unsupportedError) {
      markManifestBackendUnavailable()
      return null
    }

    throw new Error('Could not create sync manifest for this account.')
  }
}

export async function getRegisteredDeviceIds(userId: string) {
  const manifest = await ensureSyncManifest(userId)
  if (!manifest) {
    return []
  }
  return dedupeDeviceIds(manifest.deviceIds ?? [])
}

export async function registerCurrentDevice(userId: string) {
  const manifest = await ensureSyncManifest(userId)
  if (!manifest) {
    return null
  }
  const deviceId = getOrCreateDeviceId()
  const nextDeviceIds = dedupeDeviceIds([...(manifest.deviceIds ?? []), deviceId])

  if ((manifest.deviceIds ?? []).length === nextDeviceIds.length) {
    return manifest
  }

  return (await databases.updateDocument(
    DATABASE_ID,
    SYNC_MANIFESTS_COLLECTION_ID,
    manifest.$id,
    {
      deviceIds: nextDeviceIds,
      updatedAt: createIsoTimestamp()
    }
  )) as SyncManifestDocument
}

export async function unregisterCurrentDevice(userId: string) {
  const manifest = await ensureSyncManifest(userId)
  if (!manifest) {
    return null
  }
  const deviceId = getOrCreateDeviceId()
  const nextDeviceIds = dedupeDeviceIds((manifest.deviceIds ?? []).filter((value) => value !== deviceId))

  if ((manifest.deviceIds ?? []).length === nextDeviceIds.length) {
    return manifest
  }

  return (await databases.updateDocument(
    DATABASE_ID,
    SYNC_MANIFESTS_COLLECTION_ID,
    manifest.$id,
    {
      deviceIds: nextDeviceIds,
      updatedAt: createIsoTimestamp()
    }
  )) as SyncManifestDocument
}

export async function syncCurrentDeviceRegistration(userId: string) {
  if (isStaySignedInEnabled()) {
    const manifest = await registerCurrentDevice(userId)
    return dedupeDeviceIds(manifest?.deviceIds ?? [])
  }

  const manifest = await unregisterCurrentDevice(userId)
  return dedupeDeviceIds(manifest?.deviceIds ?? [])
}

export async function listVaultSnapshotEntries(vaultId?: string) {
  if (vaultMetadataBackendUnavailable) {
    return []
  }

  const queries = [
    Query.orderDesc('uploadedAt'),
    Query.limit(DEFAULT_QUERY_LIMIT)
  ]

  if (vaultId) {
    queries.unshift(Query.equal('vaultId', vaultId))
  }

  try {
    const result = await databases.listDocuments(DATABASE_ID, VAULT_SNAPSHOTS_COLLECTION_ID, queries)
    return result.documents as VaultSnapshotDocument[]
  } catch (error) {
    const unsupportedError = asUnsupportedSyncBackendError(
      error,
      'Vault metadata backend is not available for this account.'
    )
    if (unsupportedError) {
      markVaultMetadataBackendUnavailable()
      return []
    }

    throw error
  }
}

export async function getLatestVaultSnapshotEntry(vaultId: string) {
  const entries = await listVaultSnapshotEntries(vaultId)
  return entries[0] ?? null
}

export async function createVaultSnapshotEntry(
  userId: string,
  vaultId: string,
  snapshotFile: File,
  onProgress?: (progress: number) => void,
  uploadedAtOverride?: string
) {
  if (vaultMetadataBackendUnavailable) {
    throw new UnsupportedSyncBackendError('Vault metadata backend is not available for this account.')
  }

  const entryId = ID.unique()
  const deviceId = getOrCreateDeviceId()
  const parsedSnapshot = parseVaultSnapshotFileName(snapshotFile.name)
  const uploadedAt = uploadedAtOverride ?? parsedSnapshot?.snapshotAt ?? createIsoTimestamp()

  const uploadedFile = await storage.createFile(
    SNAPSHOTS_BUCKET_ID,
    entryId,
    snapshotFile,
    buildStoragePermissions(userId),
    onProgress
      ? (progressEvent) => {
          onProgress(progressEvent.progress)
        }
      : undefined
  )

  try {
    return (await databases.createDocument(
      DATABASE_ID,
      VAULT_SNAPSHOTS_COLLECTION_ID,
      entryId,
      {
        vaultId,
        uploadedAt,
        uploadedBy: deviceId,
        checkedBy: [deviceId],
        snapshotUrl: String(storage.getFileDownload(SNAPSHOTS_BUCKET_ID, entryId)),
        snapshotName: snapshotFile.name
      },
      buildDocumentPermissions(userId)
    )) as VaultSnapshotDocument
  } catch (error) {
    const unsupportedError = asUnsupportedSyncBackendError(
      error,
      'Vault metadata backend is not available for this account.'
    )
    if (unsupportedError) {
      markVaultMetadataBackendUnavailable()
      throw new UnsupportedSyncBackendError(unsupportedError.message, {
        uploadedFileId: uploadedFile.$id
      })
    }

    await storage.deleteFile(SNAPSHOTS_BUCKET_ID, entryId).catch(() => undefined)
    throw error
  }
}

export async function markVaultEntryChecked(entry: VaultSnapshotDocument, deviceId = getOrCreateDeviceId()) {
  const checkedBy = dedupeDeviceIds(entry.checkedBy ?? [])
  if (checkedBy.includes(deviceId)) {
    return entry
  }

  return (await databases.updateDocument(
    DATABASE_ID,
    VAULT_SNAPSHOTS_COLLECTION_ID,
    entry.$id,
    {
      checkedBy: [...checkedBy, deviceId]
    }
  )) as VaultSnapshotDocument
}

export function isVaultEntrySafeToDelete(entry: VaultSnapshotDocument, registeredDeviceIds: string[]) {
  const checkedBy = new Set(dedupeDeviceIds(entry.checkedBy ?? []))
  return registeredDeviceIds.every((deviceId) => checkedBy.has(deviceId))
}

export async function deleteVaultSnapshotEntry(entry: VaultSnapshotDocument) {
  await storage.deleteFile(SNAPSHOTS_BUCKET_ID, entry.$id).catch(() => undefined)
  await databases.deleteDocument(DATABASE_ID, VAULT_SNAPSHOTS_COLLECTION_ID, entry.$id).catch(() => undefined)
}

export async function acknowledgeVaultEntry(entry: VaultSnapshotDocument, registeredDeviceIds: string[]) {
  const acknowledgedEntry = await markVaultEntryChecked(entry)
  if (isVaultEntrySafeToDelete(acknowledgedEntry, registeredDeviceIds)) {
    await deleteVaultSnapshotEntry(acknowledgedEntry)
    return null
  }

  return acknowledgedEntry
}

export const isUnsupportedSyncBackendError = (error: unknown): error is UnsupportedSyncBackendError => {
  return error instanceof UnsupportedSyncBackendError
}

export const getUploadedFileIdFromUnsupportedSyncBackendError = (error: unknown) => {
  if (!isUnsupportedSyncBackendError(error)) {
    return null
  }

  return error.uploadedFileId ?? null
}
