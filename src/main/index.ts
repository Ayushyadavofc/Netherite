import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import archiver from 'archiver'
import * as unzipper from 'unzipper'

import { buildVaultSnapshotFileName } from '../shared/snapshot-files'

const ALLOWED_SCHEMES = ['https:', 'http:']
let currentVaultPath: string | null = null
let currentVaultReadOnly = false
let lastSelectedFilePath: string | null = null
const authorizedVaultPaths = new Set<string>()
const selectedDirectoryPaths = new Set<string>()
const NETHERITE_DIR_NAME = '.netherite'
const SYNC_PROGRESS_CHANNEL = 'sync-progress'

type SyncProgressPayload = {
  stage: 'checking' | 'zipping' | 'uploading' | 'downloading' | 'extracting' | 'applying'
  message: string
  currentBytes?: number
  totalBytes?: number
  percent?: number
}

type SyncProgressReporter = (payload: SyncProgressPayload) => void

type ZipSourceEntry = {
  filePath: string
  archivePath: string
  size: number
}

const ZIP_STORE_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.avif',
  '.gif',
  '.gz',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.rar',
  '.svgz',
  '.wav',
  '.webm',
  '.webp',
  '.zip'
])

const shouldStoreZipEntry = (filePath: string) => ZIP_STORE_EXTENSIONS.has(path.extname(filePath).toLowerCase())

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.m4a':
      return 'audio/mp4'
    default:
      return 'application/octet-stream'
  }
}

function resolveLocalFilePath(requestUrl: string): string {
  const parsed = new URL(requestUrl)

  // Electron sometimes canonicalizes Windows drive URLs as local-file://c/Users/...
  // Rebuild those into a normal absolute path before reading from disk.
  if (parsed.host && /^[a-z]$/i.test(parsed.host)) {
    return decodeURIComponent(`${parsed.host.toUpperCase()}:${parsed.pathname}`)
  }

  const decodedPath = decodeURIComponent(parsed.pathname)
  if (/^\/[A-Za-z]:/.test(decodedPath)) {
    return decodedPath.slice(1)
  }

  return decodeURIComponent(`${parsed.host}${parsed.pathname}`)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true } }
])

const normalizeFsPath = (filePath: string) => path.normalize(path.resolve(filePath))
const getVaultMetaPath = (vaultPath: string) => path.join(vaultPath, NETHERITE_DIR_NAME)
const getAppDataRoot = () => join(app.getPath('userData'), 'Netherite')
const getAccountsRoot = () => join(getAppDataRoot(), 'accounts')
const getTempRoot = () => join(getAppDataRoot(), 'temp')
const getAccountDataPath = (userId: string) => join(getAccountsRoot(), userId)
const getAccountSyncMetaPath = (userId: string) => path.join(getAccountDataPath(userId), 'sync-meta.json')
const formatDirectoryPath = (dirPath: string) => (dirPath.endsWith(path.sep) ? dirPath : `${dirPath}${path.sep}`)
const getVaultOwnershipConfigPath = (vaultPath: string) => path.join(getVaultMetaPath(vaultPath), 'config.json')
const getVaultFlashcardsPath = (vaultPath: string) => path.join(getVaultMetaPath(vaultPath), 'flashcards.json')
const getVaultAiPatternsPath = (vaultPath: string) => path.join(getVaultMetaPath(vaultPath), 'ai-patterns.json')
const getVaultNotesPath = (vaultPath: string) => path.join(vaultPath, 'notes')
const getVaultSyncMetaPath = (vaultPath: string) => path.join(getVaultMetaPath(vaultPath), 'sync-meta.json')

type SyncMetaMap = Record<string, string>

const normalizeForCompare = (filePath: string) => {
  const normalized = normalizeFsPath(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

const isPathInside = (rootPath: string, candidatePath: string) => {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const sanitizePathSegment = (value: string, fallback: string) => {
  const normalized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim()
  return normalized || fallback
}

const accountFilePathFor = (userId: string, filename: string) => {
  const safeUserId = sanitizePathSegment(userId, 'guest')
  const safeFilename = sanitizePathSegment(filename.replace(/\.json$/i, ''), 'data')
  return path.join(getAccountDataPath(safeUserId), `${safeFilename}.json`)
}

async function writeJsonFileAtomic(filePath: string, value: unknown) {
  const nextContent = JSON.stringify(value, null, 2)
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tempPath = `${filePath}.${randomUUID()}.tmp`

    try {
      await fs.promises.writeFile(tempPath, nextContent, 'utf-8')
      await fs.promises.rename(tempPath, filePath)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
      if ((code === 'EBUSY' || code === 'EPERM') && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)))
        continue
      }
      throw error
    }
  }
}

async function ensureNetheriteAppDataDirectories() {
  await fs.promises.mkdir(getAccountsRoot(), { recursive: true })
  await fs.promises.mkdir(getTempRoot(), { recursive: true })
}

const sanitizeTempFileName = (value: string, fallback: string) => {
  const normalized = path.basename(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim()
  return normalized || fallback
}

const createSyncProgressReporter = (sender: { send: (channel: string, payload: SyncProgressPayload) => void; isDestroyed?: () => boolean }) => {
  return (payload: SyncProgressPayload) => {
    if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
      return
    }

    sender.send(SYNC_PROGRESS_CHANNEL, payload)
  }
}

const emitByteProgress = (
  reportProgress: SyncProgressReporter | undefined,
  payload: Omit<SyncProgressPayload, 'percent'> & {
    currentBytes?: number
    totalBytes?: number
  }
) => {
  if (!reportProgress) {
    return
  }

  const { currentBytes, totalBytes } = payload
  const percent =
    typeof currentBytes === 'number' && typeof totalBytes === 'number' && totalBytes > 0
      ? Math.max(0, Math.min(100, (currentBytes / totalBytes) * 100))
      : undefined

  reportProgress({
    ...payload,
    percent
  })
}

async function collectFilesForZip(
  rootPath: string,
  getArchivePath: (relativePath: string) => string,
  options?: { skip?: (relativePath: string) => boolean }
) {
  const entries: ZipSourceEntry[] = []

  const visit = async (dirPath: string) => {
    const dirEntries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const dirEntry of dirEntries) {
      const fullPath = path.join(dirPath, dirEntry.name)
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/')

      if (options?.skip?.(relativePath)) {
        continue
      }

      if (dirEntry.isSymbolicLink()) {
        continue
      }

      if (dirEntry.isDirectory()) {
        await visit(fullPath)
        continue
      }

      if (!dirEntry.isFile()) {
        continue
      }

      const stats = await fs.promises.stat(fullPath)
      entries.push({
        filePath: fullPath,
        archivePath: getArchivePath(relativePath),
        size: stats.size
      })
    }
  }

  if (fs.existsSync(rootPath)) {
    await visit(rootPath)
  }

  return entries
}

async function createZipArchive(
  outputPath: string,
  entries: ZipSourceEntry[],
  message: string,
  reportProgress?: SyncProgressReporter
) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 1 } })
    let lastReportedBytes = -1

    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('progress', (progress) => {
      if (totalBytes <= 0) {
        return
      }

      const processedBytes = Math.min(totalBytes, progress.fs.processedBytes)
      if (processedBytes === lastReportedBytes) {
        return
      }

      lastReportedBytes = processedBytes
      emitByteProgress(reportProgress, {
        stage: 'zipping',
        message,
        currentBytes: processedBytes,
        totalBytes
      })
    })
    archive.pipe(output)

    for (const entry of entries) {
      archive.file(entry.filePath, {
        name: entry.archivePath,
        store: shouldStoreZipEntry(entry.filePath)
      })
    }

    void archive.finalize()
  })

  emitByteProgress(reportProgress, {
    stage: 'zipping',
    message,
    currentBytes: totalBytes,
    totalBytes
  })

  return outputPath
}

async function zipAccountData(userId: string, reportProgress?: SyncProgressReporter) {
  const safeUserId = sanitizePathSegment(userId, 'guest')
  const accountPath = getAccountDataPath(safeUserId)
  const zipPath = path.join(getTempRoot(), `account-${safeUserId}.zip`)
  const filenames = ['habits.json', 'todos.json', 'themes.json', 'settings.json']
  await buildAccountSyncMeta(safeUserId)

  const entries: ZipSourceEntry[] = []
  for (const filename of filenames) {
    const filePath = path.join(accountPath, filename)
    if (!fs.existsSync(filePath)) {
      continue
    }

    const stats = await fs.promises.stat(filePath)
    entries.push({
      filePath,
      archivePath: filename,
      size: stats.size
    })
  }

  const syncMetaPath = getAccountSyncMetaPath(safeUserId)
  if (fs.existsSync(syncMetaPath)) {
    const syncMetaStats = await fs.promises.stat(syncMetaPath)
    entries.push({
      filePath: syncMetaPath,
      archivePath: 'sync-meta.json',
      size: syncMetaStats.size
    })
  }

  return createZipArchive(zipPath, entries, 'Zipping account data...', reportProgress)
}

async function zipVaultDirectory(vaultPath: string, reportProgress?: SyncProgressReporter) {
  const resolvedVaultPath = await resolveKnownVaultPath(vaultPath)
  const ownershipConfig = await readJsonFile<{ vaultId?: string; ownerId?: string }>(
    getVaultOwnershipConfigPath(resolvedVaultPath)
  )
  const vaultId = sanitizePathSegment(ownershipConfig?.vaultId ?? '', '')
  const ownerId = sanitizePathSegment(ownershipConfig?.ownerId ?? 'guest', 'guest')

  if (!vaultId) {
    throw new Error('Vault config missing vaultId')
  }

  const vaultName = path.basename(resolvedVaultPath)
  const zipPath = path.join(
    getTempRoot(),
    buildVaultSnapshotFileName({
      timestamp: new Date(),
      vaultName,
      ownerId,
      vaultId
    })
  )
  await buildVaultSyncMeta(resolvedVaultPath)
  const entries = await collectFilesForZip(
    resolvedVaultPath,
    (relativePath) => path.posix.join(vaultName, relativePath),
    {
      skip: (relativePath) => relativePath.trim().length === 0
    }
  )

  return createZipArchive(zipPath, entries, `Zipping ${vaultName}...`, reportProgress)
}

const getSharedRootSegment = (entries: unzipper.Entry[]) => {
  const firstSegments = entries
    .map((entry) => entry.path.split('/').filter(Boolean)[0] ?? '')
    .filter(Boolean)

  if (firstSegments.length === 0) {
    return null
  }

  const rootSegment = firstSegments[0]
  return firstSegments.every((segment) => segment === rootSegment) ? rootSegment : null
}

const CONCURRENCY_LIMIT = 16

async function runConcurrent<T>(items: T[], fn: (item: T) => Promise<void>, limit = CONCURRENCY_LIMIT) {
  let index = 0
  const run = async () => {
    while (index < items.length) {
      const current = index++
      await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
}

async function extractZipToDirectory(
  zipPath: string,
  destinationPath: string,
  options?: { stripRootSegment?: string | null; reportProgress?: SyncProgressReporter; message?: string }
) {
  const openedZip = await unzipper.Open.file(zipPath)
  await fs.promises.mkdir(destinationPath, { recursive: true })

  type ResolvedEntry = { entry: (typeof openedZip.files)[number]; destPath: string }
  const fileEntries: ResolvedEntry[] = []
  const dirPaths = new Set<string>()
  let totalBytes = 0

  for (const entry of openedZip.files) {
    const normalizedEntryPath = entry.path.replace(/\\/g, '/')
    let relativeEntryPath = normalizedEntryPath

    if (options?.stripRootSegment && normalizedEntryPath.startsWith(`${options.stripRootSegment}/`)) {
      relativeEntryPath = normalizedEntryPath.slice(options.stripRootSegment.length + 1)
    } else if (options?.stripRootSegment === normalizedEntryPath) {
      relativeEntryPath = ''
    }

    if (!relativeEntryPath) {
      continue
    }

    const destinationFilePath = normalizeFsPath(path.join(destinationPath, relativeEntryPath))
    if (!isPathInside(destinationPath, destinationFilePath)) {
      throw new Error('Archive contains an invalid path')
    }

    if (entry.type === 'Directory') {
      dirPaths.add(destinationFilePath)
    } else {
      dirPaths.add(path.dirname(destinationFilePath))
      fileEntries.push({ entry, destPath: destinationFilePath })
      totalBytes += Number((entry as { vars?: { uncompressedSize?: number } }).vars?.uncompressedSize ?? 0)
    }
  }

  emitByteProgress(options?.reportProgress, {
    stage: 'extracting',
    message: options?.message ?? 'Extracting archive...',
    currentBytes: 0,
    totalBytes
  })

  // Create all directories first
  await Promise.all(Array.from(dirPaths).map((dir) => fs.promises.mkdir(dir, { recursive: true })))

  // Extract all files in parallel with concurrency limit
  let processedBytes = 0
  await runConcurrent(fileEntries, async ({ entry, destPath }) => {
    await new Promise<void>((resolve, reject) => {
      const readStream = entry.stream()
      const writeStream = fs.createWriteStream(destPath)
      let entryBytes = 0

      readStream.on('data', (chunk) => {
        entryBytes += chunk.length
        processedBytes += chunk.length
        emitByteProgress(options?.reportProgress, {
          stage: 'extracting',
          message: options?.message ?? 'Extracting archive...',
          currentBytes: processedBytes,
          totalBytes
        })
      })

      readStream.on('error', reject)
      writeStream.on('finish', () => {
        const expectedSize = Number((entry as { vars?: { uncompressedSize?: number } }).vars?.uncompressedSize ?? 0)
        if (expectedSize > entryBytes) {
          processedBytes += expectedSize - entryBytes
        }
        emitByteProgress(options?.reportProgress, {
          stage: 'extracting',
          message: options?.message ?? 'Extracting archive...',
          currentBytes: processedBytes,
          totalBytes
        })
        resolve()
      })
      writeStream.on('error', reject)

      readStream.pipe(writeStream)
    })
  })

  emitByteProgress(options?.reportProgress, {
    stage: 'extracting',
    message: options?.message ?? 'Extracting archive...',
    currentBytes: totalBytes,
    totalBytes
  })
}

async function unzipAccountData(userId: string, zipPath: string, reportProgress?: SyncProgressReporter) {
  const safeUserId = sanitizePathSegment(userId, 'guest')
  const resolvedZipPath = normalizeFsPath(zipPath)
  if (!isPathInside(getTempRoot(), resolvedZipPath) || !fs.existsSync(resolvedZipPath)) {
    throw new Error('Zip file not found in temp directory')
  }

  const accountPath = getAccountDataPath(safeUserId)
  await fs.promises.mkdir(accountPath, { recursive: true })
  await extractZipToDirectory(resolvedZipPath, accountPath, {
    reportProgress,
    message: 'Extracting account data...'
  })
  return formatDirectoryPath(accountPath)
}

async function unzipVaultArchive(zipPath: string, targetPath: string, reportProgress?: SyncProgressReporter) {
  const resolvedZipPath = normalizeFsPath(zipPath)
  if (!isPathInside(getTempRoot(), resolvedZipPath) || !fs.existsSync(resolvedZipPath)) {
    throw new Error('Zip file not found in temp directory')
  }

  const openedZip = await unzipper.Open.file(resolvedZipPath)
  const rootSegment = getSharedRootSegment(openedZip.files)
  const fallbackVaultName = sanitizePathSegment(rootSegment ?? path.basename(resolvedZipPath, '.zip'), 'Vault')
  const hasTargetPath = Boolean(targetPath)
  const resolvedTargetPath = hasTargetPath
    ? normalizeFsPath(targetPath)
    : path.join(app.getPath('downloads'), 'Netherite', fallbackVaultName)

  await fs.promises.mkdir(resolvedTargetPath, { recursive: true })
  await extractZipToDirectory(resolvedZipPath, resolvedTargetPath, {
    stripRootSegment: rootSegment,
    reportProgress,
    message: 'Extracting vault...'
  })
  await rememberAuthorizedVaultPath(resolvedTargetPath)
  return resolvedTargetPath
}

/**
 * Smart merge: compare zip entry mtimes against local files.
 * Only copies files from the zip where the server version is newer or the file is missing locally.
 */
async function mergeVaultFromZip(
  localVaultPath: string,
  zipPath: string,
  reportProgress?: SyncProgressReporter
): Promise<{ updated: string[]; added: string[] }> {
  const resolvedVaultPath = await resolveKnownVaultPath(localVaultPath)
  const resolvedZipPath = normalizeFsPath(zipPath)

  if (!fs.existsSync(resolvedZipPath)) {
    throw new Error('Zip file not found')
  }

  const openedZip = await unzipper.Open.file(resolvedZipPath)
  const rootSegment = getSharedRootSegment(openedZip.files)

  // Phase 1: Build list of candidate entries (filter/parse paths)
  type MergeCandidate = {
    entry: (typeof openedZip.files)[number]
    relPath: string
    localFilePath: string
    zipMtimeMs: number
    zipFileMtime: Date | undefined
  }
  const candidates: MergeCandidate[] = []

  for (const entry of openedZip.files) {
    if (entry.type === 'Directory') continue

    let relPath = entry.path.replace(/\\/g, '/')
    if (rootSegment && relPath.startsWith(`${rootSegment}/`)) {
      relPath = relPath.slice(rootSegment.length + 1)
    } else if (rootSegment === relPath) {
      continue
    }
    if (!relPath || relPath.endsWith('/')) continue

    const localFilePath = path.join(resolvedVaultPath, relPath)
    if (!isPathInside(resolvedVaultPath, normalizeFsPath(localFilePath))) {
      continue
    }

    const zipFileMtime = (entry as any).lastModifiedDateTime as Date | undefined
    const zipMtimeMs = zipFileMtime ? zipFileMtime.getTime() : Date.now()
    candidates.push({ entry, relPath, localFilePath, zipMtimeMs, zipFileMtime })
  }

  // Phase 2: Parallel stat to determine which files need copying
  type CopyAction = MergeCandidate & { isNew: boolean }
  const copyActions: CopyAction[] = []
  const dirPaths = new Set<string>()

  await runConcurrent(candidates, async (candidate) => {
    try {
      const localStat = await fs.promises.stat(candidate.localFilePath)
      if (candidate.zipMtimeMs > localStat.mtimeMs) {
        dirPaths.add(path.dirname(candidate.localFilePath))
        copyActions.push({ ...candidate, isNew: false })
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        dirPaths.add(path.dirname(candidate.localFilePath))
        copyActions.push({ ...candidate, isNew: true })
      }
    }
  })

  // Phase 3: Create directories, then parallel write
  await Promise.all(Array.from(dirPaths).map((dir) => fs.promises.mkdir(dir, { recursive: true })))

  const updated: string[] = []
  const added: string[] = []
  const totalBytes = copyActions.reduce(
    (sum, action) =>
      sum + Number((action.entry as { vars?: { uncompressedSize?: number } }).vars?.uncompressedSize ?? 0),
    0
  )
  let processedBytes = 0

  emitByteProgress(reportProgress, {
    stage: 'applying',
    message: 'Applying synced changes...',
    currentBytes: 0,
    totalBytes
  })

  await runConcurrent(copyActions, async (action) => {
    const content = await action.entry.buffer()
    await fs.promises.writeFile(action.localFilePath, content)
    if (action.zipFileMtime) {
      await fs.promises.utimes(action.localFilePath, action.zipFileMtime, action.zipFileMtime)
    }
    if (action.isNew) {
      added.push(action.relPath)
    } else {
      updated.push(action.relPath)
    }

    processedBytes += Number((action.entry as { vars?: { uncompressedSize?: number } }).vars?.uncompressedSize ?? content.length)
    emitByteProgress(reportProgress, {
      stage: 'applying',
      message: 'Applying synced changes...',
      currentBytes: processedBytes,
      totalBytes
    })
  })

  emitByteProgress(reportProgress, {
    stage: 'applying',
    message: copyActions.length > 0 ? 'Applying synced changes...' : 'No synced changes to apply.',
    currentBytes: totalBytes,
    totalBytes
  })

  return { updated, added }
}

async function clearTempDirectory() {
  await fs.promises.mkdir(getTempRoot(), { recursive: true })
  const entries = await fs.promises.readdir(getTempRoot(), { withFileTypes: true })

  await Promise.all(
    entries.map((entry) =>
      fs.promises.rm(path.join(getTempRoot(), entry.name), {
        recursive: entry.isDirectory(),
        force: true
      })
    )
  )
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    if (!raw || raw.trim() === '') {
      return null
    }
    return JSON.parse(raw) as T
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    // Return null on JSON parse failures instead of crashing
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

const normalizeVaultRelativePath = (vaultPath: string, filePath: string) =>
  path.relative(vaultPath, filePath).replace(/\\/g, '/')

const isWritableVaultMetaFile = (relativePath: string) =>
  relativePath === '.netherite/config.json' ||
  relativePath === '.netherite/flashcards.json' ||
  relativePath === '.netherite/ai-patterns.json'

async function writeSyncMetaFile(metaPath: string, meta: SyncMetaMap) {
  await writeJsonFileAtomic(metaPath, meta)
}

async function readSyncMetaFile(metaPath: string): Promise<SyncMetaMap> {
  const existing = await readJsonFile<SyncMetaMap>(metaPath)
  if (isRecord(existing)) {
    return existing as SyncMetaMap
  }

  // If readJsonFile returned null and the file exists, it might be corrupt or empty.
  // Back it up before starting fresh.
  if (existing === null && fs.existsSync(metaPath)) {
    try {
      const stat = await fs.promises.stat(metaPath)
      if (stat.size > 0) {
        await fs.promises.rename(metaPath, `${metaPath}.corrupt-${Date.now()}`)
      }
    } catch {
      // Ignore backup failures
    }
    
    await writeSyncMetaFile(metaPath, {})
    return {}
  }

  return {}
}

async function updateSyncMetaEntry(metaPath: string, entryKey: string, timestamp = new Date().toISOString()) {
  const currentMeta = await readSyncMetaFile(metaPath)
  currentMeta[entryKey] = timestamp
  await writeSyncMetaFile(metaPath, currentMeta)
  return currentMeta
}

async function removeSyncMetaEntries(metaPath: string, entryKeys: string[]) {
  const currentMeta = await readSyncMetaFile(metaPath)
  let changed = false

  for (const entryKey of entryKeys) {
    if (entryKey in currentMeta) {
      delete currentMeta[entryKey]
      changed = true
    }
  }

  if (changed) {
    await writeSyncMetaFile(metaPath, currentMeta)
  }

  return currentMeta
}

async function buildAccountSyncMeta(userId: string) {
  const safeUserId = sanitizePathSegment(userId, 'guest')
  const accountPath = getAccountDataPath(safeUserId)
  await fs.promises.mkdir(accountPath, { recursive: true })

  const existingMeta = await readSyncMetaFile(getAccountSyncMetaPath(safeUserId))
  const nextMeta: SyncMetaMap = {}

  for (const filename of ['habits.json', 'todos.json', 'themes.json', 'settings.json']) {
    const filePath = path.join(accountPath, filename)
    if (!fs.existsSync(filePath)) {
      continue
    }

    nextMeta[filename] = existingMeta[filename] ?? (await fs.promises.stat(filePath)).mtime.toISOString()
  }

  await writeSyncMetaFile(getAccountSyncMetaPath(safeUserId), nextMeta)
  return nextMeta
}

async function buildVaultSyncMeta(vaultPath: string) {
  const resolvedVaultPath = normalizeFsPath(vaultPath)
  const existingMeta = await readSyncMetaFile(getVaultSyncMetaPath(resolvedVaultPath))
  const nextMeta: SyncMetaMap = {}

  // Phase 1: Collect all file paths with a recursive walk (no stat calls yet)
  const filePaths: { fullPath: string; relativePath: string }[] = []

  const visit = async (dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = normalizeVaultRelativePath(resolvedVaultPath, fullPath)

      if (relativePath === '.netherite/sync-meta.json') {
        continue
      }

      if (entry.isDirectory()) {
        await visit(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      // If we already have a timestamp from the existing meta, no stat needed
      if (existingMeta[relativePath]) {
        nextMeta[relativePath] = existingMeta[relativePath]
      } else {
        filePaths.push({ fullPath, relativePath })
      }
    }
  }

  if (fs.existsSync(resolvedVaultPath)) {
    await visit(resolvedVaultPath)
  }

  // Phase 2: Parallel stat only for files without existing meta
  await runConcurrent(filePaths, async ({ fullPath, relativePath }) => {
    const stat = await fs.promises.stat(fullPath)
    nextMeta[relativePath] = stat.mtime.toISOString()
  })

  await writeSyncMetaFile(getVaultSyncMetaPath(resolvedVaultPath), nextMeta)
  return nextMeta
}

async function updateAccountSyncMeta(userId: string, filename: string, timestamp = new Date().toISOString()) {
  const safeUserId = sanitizePathSegment(userId, 'guest')
  await fs.promises.mkdir(getAccountDataPath(safeUserId), { recursive: true })
  return updateSyncMetaEntry(getAccountSyncMetaPath(safeUserId), `${sanitizePathSegment(filename.replace(/\.json$/i, ''), 'data')}.json`, timestamp)
}

async function updateVaultSyncMetaForPath(vaultPath: string, filePath: string, timestamp = new Date().toISOString()) {
  const resolvedVaultPath = normalizeFsPath(vaultPath)
  const resolvedFilePath = normalizeFsPath(filePath)
  const relativePath = normalizeVaultRelativePath(resolvedVaultPath, resolvedFilePath)
  if (!relativePath || relativePath === '.netherite/sync-meta.json') {
    return readSyncMetaFile(getVaultSyncMetaPath(resolvedVaultPath))
  }

  await fs.promises.mkdir(getVaultMetaPath(resolvedVaultPath), { recursive: true })
  return updateSyncMetaEntry(getVaultSyncMetaPath(resolvedVaultPath), relativePath, timestamp)
}

async function removeVaultSyncMetaForPath(vaultPath: string, relativePath: string) {
  return removeSyncMetaEntries(getVaultSyncMetaPath(vaultPath), [relativePath.replace(/\\/g, '/')])
}

async function removeVaultSyncMetaForPrefix(vaultPath: string, relativePath: string) {
  const metaPath = getVaultSyncMetaPath(vaultPath)
  const currentMeta = await readSyncMetaFile(metaPath)
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const entryKeys = Object.keys(currentMeta).filter(
    (entryKey) => entryKey === normalizedPath || entryKey.startsWith(`${normalizedPath}/`)
  )

  if (entryKeys.length === 0) {
    return currentMeta
  }

  return removeSyncMetaEntries(metaPath, entryKeys)
}

async function renameVaultSyncMetaEntries(vaultPath: string, oldRelativePath: string, newRelativePath: string) {
  const metaPath = getVaultSyncMetaPath(vaultPath)
  const currentMeta = await readSyncMetaFile(metaPath)
  const normalizedOldPath = oldRelativePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedNewPath = newRelativePath.replace(/\\/g, '/').replace(/\/+$/, '')
  let changed = false

  for (const [entryKey, timestamp] of Object.entries(currentMeta)) {
    if (entryKey !== normalizedOldPath && !entryKey.startsWith(`${normalizedOldPath}/`)) {
      continue
    }

    const suffix = entryKey.slice(normalizedOldPath.length)
    delete currentMeta[entryKey]
    currentMeta[`${normalizedNewPath}${suffix}`] = timestamp
    changed = true
  }

  if (changed) {
    await writeSyncMetaFile(metaPath, currentMeta)
  }

  return currentMeta
}

const getAuthorizedVaultsFilePath = () => join(app.getPath('userData'), 'authorized-vaults.json')

async function loadAuthorizedVaultPaths() {
  try {
    const filePath = getAuthorizedVaultsFilePath()
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return

    for (const entry of entries) {
      if (typeof entry !== 'string') continue
      try {
        const resolved = await fs.promises.realpath(normalizeFsPath(entry))
        const stats = await fs.promises.stat(resolved)
        if (stats.isDirectory()) authorizedVaultPaths.add(normalizeForCompare(resolved))
      } catch {
        // Ignore stale paths.
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('Failed to load authorized vaults:', error)
    }
  }
}

async function persistAuthorizedVaultPaths() {
  const filePath = getAuthorizedVaultsFilePath()
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const entries = Array.from(authorizedVaultPaths.values()).sort()
  await writeJsonFileAtomic(filePath, entries)
}

async function rememberAuthorizedVaultPath(vaultPath: string) {
  authorizedVaultPaths.add(normalizeForCompare(vaultPath))
  await persistAuthorizedVaultPaths()
}

async function resolveExistingDirectory(dirPath: string) {
  const resolved = normalizeFsPath(dirPath)
  const realPath = await fs.promises.realpath(resolved)
  const stats = await fs.promises.stat(realPath)
  if (!stats.isDirectory()) {
    throw new Error('Expected a directory')
  }
  return normalizeFsPath(realPath)
}

async function resolveExistingFile(filePath: string) {
  const resolved = normalizeFsPath(filePath)
  const realPath = await fs.promises.realpath(resolved)
  const stats = await fs.promises.stat(realPath)
  if (!stats.isFile()) {
    throw new Error('Expected a file')
  }
  return normalizeFsPath(realPath)
}

async function resolveKnownVaultPath(vaultPath: string) {
  const resolvedPath = await resolveExistingDirectory(vaultPath)
  const normalizedPath = normalizeForCompare(resolvedPath)
  const normalizedCurrentVault = currentVaultPath ? normalizeForCompare(currentVaultPath) : null

  if (
    normalizedCurrentVault !== normalizedPath &&
    !authorizedVaultPaths.has(normalizedPath) &&
    !selectedDirectoryPaths.has(normalizedPath)
  ) {
    throw new Error('Access denied: vault was not selected by the user')
  }

  return resolvedPath
}

async function initVaultMetadata(vaultPath: string, userId: string) {
  const metaPath = getVaultMetaPath(vaultPath)
  const configPath = getVaultOwnershipConfigPath(vaultPath)
  const safeUserId = sanitizePathSegment(userId, 'guest')

  await fs.promises.mkdir(metaPath, { recursive: true })

  let config = await readJsonFile<{
    ownerId?: string
    vaultId?: string
    createdAt?: string
  }>(configPath)

  if (!config) {
    config = {
      ownerId: safeUserId,
      vaultId: randomUUID(),
      createdAt: new Date().toISOString()
    }
    await writeJsonFileAtomic(configPath, config)
    await updateVaultSyncMetaForPath(vaultPath, configPath)
  }

  if ((await readJsonFile(getVaultFlashcardsPath(vaultPath))) === null) {
    await writeJsonFileAtomic(getVaultFlashcardsPath(vaultPath), [])
    await updateVaultSyncMetaForPath(vaultPath, getVaultFlashcardsPath(vaultPath))
  }

  if ((await readJsonFile(getVaultAiPatternsPath(vaultPath))) === null) {
    await writeJsonFileAtomic(getVaultAiPatternsPath(vaultPath), {})
    await updateVaultSyncMetaForPath(vaultPath, getVaultAiPatternsPath(vaultPath))
  }

  return config
}

async function checkVaultOwnership(vaultPath: string, userId: string) {
  const resolvedVaultPath = await resolveKnownVaultPath(vaultPath)
  const config = await readJsonFile<{ ownerId?: string }>(getVaultOwnershipConfigPath(resolvedVaultPath))
  const safeUserId = sanitizePathSegment(userId, 'guest')

  if (!config?.ownerId) {
    return { owned: null }
  }

  if (config.ownerId === safeUserId) {
    return { owned: true as const }
  }

  return {
    owned: false as const,
    ownerId: config.ownerId
  }
}

async function cloneVaultDirectory(sourcePath: string, userId: string) {
  const resolvedSourcePath = await resolveKnownVaultPath(sourcePath)
  const parentPath = path.dirname(resolvedSourcePath)
  const vaultName = path.basename(resolvedSourcePath)
  const safeUserId = sanitizePathSegment(userId, 'guest')

  let clonePath = path.join(parentPath, `${vaultName}-${safeUserId}-clone`)
  let suffix = 2
  while (fs.existsSync(clonePath)) {
    clonePath = path.join(parentPath, `${vaultName}-${safeUserId}-clone-${suffix}`)
    suffix += 1
  }

  await fs.promises.cp(resolvedSourcePath, clonePath, { recursive: true, force: false })
  await fs.promises.rm(getVaultOwnershipConfigPath(clonePath), { force: true }).catch(() => undefined)
  await initVaultMetadata(clonePath, safeUserId)
  return clonePath
}

async function createVaultAtExactPath(targetPath: string, welcomeContent: string) {
  const resolvedTargetPath = normalizeFsPath(targetPath)
  const parentPath = await resolveExistingDirectory(path.dirname(resolvedTargetPath))

  if (fs.existsSync(resolvedTargetPath)) {
    throw new Error('A folder with this vault name already exists')
  }

  await fs.promises.mkdir(resolvedTargetPath, { recursive: false })
  await fs.promises.mkdir(path.join(resolvedTargetPath, 'notes'), { recursive: false })
  await fs.promises.mkdir(path.join(resolvedTargetPath, 'flashcards'), { recursive: false })
  await fs.promises.mkdir(path.join(resolvedTargetPath, 'settings'), { recursive: false })
  const welcomeNotePath = path.join(resolvedTargetPath, 'notes', 'Welcome.md')
  await fs.promises.writeFile(welcomeNotePath, welcomeContent, 'utf-8')

  const resolvedVaultPath = await resolveExistingDirectory(resolvedTargetPath)
  currentVaultPath = resolvedVaultPath
  currentVaultReadOnly = false
  selectedDirectoryPaths.add(normalizeForCompare(parentPath))
  await rememberAuthorizedVaultPath(resolvedVaultPath)
  await updateVaultSyncMetaForPath(resolvedVaultPath, welcomeNotePath)
  return resolvedVaultPath
}

async function resolvePathWithinVault(
  targetPath: string,
  options: { allowMissingLeaf?: boolean; expectDirectory?: boolean } = {}
) {
  if (!currentVaultPath) {
    throw new Error('Vault not selected')
  }

  const resolvedTarget = normalizeFsPath(targetPath)
  let candidatePath: string

  if (options.allowMissingLeaf) {
    let existingAncestor = resolvedTarget
    while (!fs.existsSync(existingAncestor)) {
      const parent = path.dirname(existingAncestor)
      if (parent === existingAncestor) {
        throw new Error('Access denied: outside vault')
      }
      existingAncestor = parent
    }

    const realAncestor = normalizeFsPath(await fs.promises.realpath(existingAncestor))
    const relativeToAncestor = path.relative(existingAncestor, resolvedTarget)
    if (relativeToAncestor.startsWith('..') || path.isAbsolute(relativeToAncestor)) {
      throw new Error('Access denied: outside vault')
    }

    candidatePath = normalizeFsPath(path.join(realAncestor, relativeToAncestor))
  } else {
    candidatePath = normalizeFsPath(await fs.promises.realpath(resolvedTarget))
  }

  if (!isPathInside(currentVaultPath, candidatePath)) {
    throw new Error('Access denied: outside vault')
  }

  if (!options.allowMissingLeaf) {
    const stats = await fs.promises.stat(candidatePath)
    if (options.expectDirectory && !stats.isDirectory()) {
      throw new Error('Expected a directory')
    }
    if (!options.expectDirectory && !stats.isFile()) {
      throw new Error('Expected a file')
    }
  }

  return candidatePath
}

const isInsideVault = (filePath: string): boolean => {
  if (!currentVaultPath) return false
  return isPathInside(currentVaultPath, normalizeFsPath(filePath))
}

const assertVaultWritable = () => {
  if (currentVaultReadOnly) {
    throw new Error('Vault is read-only')
  }
}

const assertInsideNotesRoot = (notesRootPath: string, targetPath: string) => {
  if (!isPathInside(notesRootPath, targetPath)) {
    throw new Error('Access denied: outside notes folder')
  }
}

const resolveNotePathInput = (notesRootPath: string, targetPath: string) => {
  const candidatePath = path.isAbsolute(targetPath) ? targetPath : path.join(notesRootPath, targetPath)
  return normalizeFsPath(candidatePath)
}

const resolveExistingNotePath = async (notesRootPath: string, targetPath: string) => {
  const safePath = normalizeFsPath(await fs.promises.realpath(resolveNotePathInput(notesRootPath, targetPath)))
  assertInsideNotesRoot(notesRootPath, safePath)
  return safePath
}

const resolvePendingNotePath = (notesRootPath: string, targetPath: string) => {
  const safePath = resolveNotePathInput(notesRootPath, targetPath)
  assertInsideNotesRoot(notesRootPath, safePath)
  return safePath
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (ALLOWED_SCHEMES.includes(parsed.protocol)) {
        shell.openExternal(details.url)
      }
    } catch {
      // invalid URL, do nothing
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC Handlers ──────────────────────────────────────

/** Open native folder-select dialog, returns the selected path or null */
ipcMain.handle('selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const selectedPath = await resolveExistingDirectory(result.filePaths[0])
  selectedDirectoryPaths.add(normalizeForCompare(selectedPath))
  return selectedPath
})

ipcMain.handle('readAccountFile', async (_event, userId: string, filename: string) => {
  await ensureNetheriteAppDataDirectories()
  return readJsonFile(accountFilePathFor(userId, filename))
})

ipcMain.handle('writeAccountFile', async (_event, userId: string, filename: string, data: unknown) => {
  await ensureNetheriteAppDataDirectories()
  const filePath = accountFilePathFor(userId, filename)
  await writeJsonFileAtomic(filePath, data)
  await updateAccountSyncMeta(userId, filename)
  return data
})

ipcMain.handle('directoryExists', async (_event, dirPath: string) => {
  try {
    const resolvedPath = normalizeFsPath(dirPath)
    const stats = await fs.promises.stat(resolvedPath)
    return stats.isDirectory()
  } catch {
    return false
  }
})

ipcMain.handle('migrateGuestData', async (_event, userId: string) => {
  await ensureNetheriteAppDataDirectories()
  const guestPath = getAccountDataPath('guest')
  const targetPath = getAccountDataPath(sanitizePathSegment(userId, 'guest'))

  if (!fs.existsSync(guestPath)) {
    return false
  }

  await fs.promises.mkdir(targetPath, { recursive: true })
  const entries = await fs.promises.readdir(guestPath, { withFileTypes: true })

  for (const entry of entries) {
    const source = path.join(guestPath, entry.name)
    const destination = path.join(targetPath, entry.name)
    await fs.promises.cp(source, destination, { recursive: true, force: true })
  }

  await fs.promises.rm(guestPath, { recursive: true, force: true })
  return true
})

ipcMain.handle('zipAccountData', async (event, userId: string) => {
  await ensureNetheriteAppDataDirectories()
  return zipAccountData(userId, createSyncProgressReporter(event.sender))
})

ipcMain.handle('zipVault', async (event, vaultPath: string) => {
  await ensureNetheriteAppDataDirectories()
  return zipVaultDirectory(vaultPath, createSyncProgressReporter(event.sender))
})

ipcMain.handle('unzipAccountData', async (event, userId: string, zipPath: string) => {
  await ensureNetheriteAppDataDirectories()
  return unzipAccountData(userId, zipPath, createSyncProgressReporter(event.sender))
})

ipcMain.handle('unzipVault', async (event, zipPath: string, targetPath: string) => {
  await ensureNetheriteAppDataDirectories()
  return unzipVaultArchive(zipPath, targetPath, createSyncProgressReporter(event.sender))
})

ipcMain.handle('mergeVaultFromZip', async (event, localVaultPath: string, zipPath: string) => {
  return mergeVaultFromZip(localVaultPath, zipPath, createSyncProgressReporter(event.sender))
})

ipcMain.handle('clearTemp', async () => {
  await clearTempDirectory()
  return true
})

ipcMain.handle('readBinaryFile', async (_event, filePath: string) => {
  const resolvedFilePath = normalizeFsPath(filePath)
  if (!isPathInside(getTempRoot(), resolvedFilePath) || !fs.existsSync(resolvedFilePath)) {
    throw new Error('Access denied: file not found in temp directory')
  }

  const buffer = await fs.promises.readFile(resolvedFilePath)
  return new Uint8Array(buffer)
})

ipcMain.handle('writeTempFile', async (_event, filename: string, data: ArrayBuffer) => {
  await ensureNetheriteAppDataDirectories()
  const safeFileName = sanitizeTempFileName(filename, `temp-${Date.now()}.zip`)
  const filePath = path.join(getTempRoot(), safeFileName)
  await fs.promises.writeFile(filePath, new Uint8Array(data))
  return filePath
})

/** Recursively scan a directory for .md files and subdirectories */
interface FsNode {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: FsNode[]
  content?: string
}

async function scanDirectory(
  dirPath: string,
  relativeTo: string,
  includeMarkdownContent = false
): Promise<FsNode[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const nodes: FsNode[] = []
  const indexedExt = new Set(['md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a'])

  for (const entry of entries) {
    try {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/')

      if (entry.isSymbolicLink()) {
        console.warn('Skipping symbolic link inside vault:', relPath)
        continue
      }

      if (entry.isDirectory()) {
        if (entry.name === NETHERITE_DIR_NAME) {
          continue
        }
        const children = await scanDirectory(fullPath, relativeTo, includeMarkdownContent)
        nodes.push({
          name: entry.name,
          type: 'folder',
          path: relPath,
          children
        })
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop()?.toLowerCase() || ''
        if (!indexedExt.has(ext)) continue
        const node: FsNode = {
          name: entry.name,
          type: 'file',
          path: relPath
        }
        if (ext === 'md' && includeMarkdownContent) {
          node.content = await fs.promises.readFile(fullPath, 'utf-8')
        }
        nodes.push(node)
      }
    } catch (err) {
      console.warn('Skipping unreadable entry:', entry.name, err)
      continue
    }
  }

  // Sort: folders first, then files, alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

ipcMain.handle(
  'activateVault',
  async (_event, requestedPath: string, options?: { readOnly?: boolean }) => {
    const resolvedPath = await resolveExistingDirectory(requestedPath)
    const normalizedPath = normalizeForCompare(resolvedPath)
    if (
      !authorizedVaultPaths.has(normalizedPath) &&
      !selectedDirectoryPaths.has(normalizedPath)
    ) {
      throw new Error('Access denied: vault was not selected by the user')
    }

    currentVaultPath = resolvedPath
    currentVaultReadOnly = options?.readOnly === true
    await rememberAuthorizedVaultPath(resolvedPath)
    return resolvedPath
  }
)

ipcMain.handle(
  'createVault',
  async (_event, parentPath: string, vaultName: string, welcomeContent: string) => {
    const safeVaultName = vaultName.trim()
    if (!safeVaultName || safeVaultName !== path.basename(safeVaultName) || /[<>:"/\\|?*\x00-\x1F]/.test(safeVaultName)) {
      throw new Error('Vault name is invalid')
    }

    const resolvedParentPath = await resolveExistingDirectory(parentPath)
    if (!selectedDirectoryPaths.has(normalizeForCompare(resolvedParentPath))) {
      throw new Error('Access denied: parent folder was not selected by the user')
    }

    const vaultPath = path.join(resolvedParentPath, safeVaultName)
    if (fs.existsSync(vaultPath)) {
      throw new Error('A folder with this vault name already exists')
    }

    await fs.promises.mkdir(vaultPath, { recursive: false })
    await fs.promises.mkdir(path.join(vaultPath, 'notes'), { recursive: false })
    await fs.promises.mkdir(path.join(vaultPath, 'flashcards'), { recursive: false })
    await fs.promises.mkdir(path.join(vaultPath, 'settings'), { recursive: false })
    const welcomeNotePath = path.join(vaultPath, 'notes', 'Welcome.md')
    await fs.promises.writeFile(welcomeNotePath, welcomeContent, 'utf-8')

    const resolvedVaultPath = await resolveExistingDirectory(vaultPath)
    currentVaultPath = resolvedVaultPath
    currentVaultReadOnly = false
    await rememberAuthorizedVaultPath(resolvedVaultPath)
    await updateVaultSyncMetaForPath(resolvedVaultPath, welcomeNotePath)
    return resolvedVaultPath
  }
)

ipcMain.handle('createVaultAtPath', async (_event, targetPath: string, welcomeContent: string) => {
  return createVaultAtExactPath(targetPath, welcomeContent)
})

ipcMain.handle('readFolder', async (_event, dirPath: string, options?: { includeMarkdownContent?: boolean }) => {
  try {
    const safeDirPath = await resolvePathWithinVault(dirPath, { expectDirectory: true })
    return await scanDirectory(safeDirPath, safeDirPath, options?.includeMarkdownContent === true)
  } catch (err) {
    console.error('readFolder error:', err)
    return []
  }
})

ipcMain.handle('readFile', async (_event, filePath: string) => {
  const safeFilePath = await resolvePathWithinVault(filePath)
  return fs.promises.readFile(safeFilePath, 'utf-8')
})

ipcMain.handle('fileExists', async (_event, filePath: string) => {
  try {
    const safeFilePath = await resolvePathWithinVault(filePath, { allowMissingLeaf: true })
    return fs.existsSync(safeFilePath)
  } catch {
    return false
  }
})

ipcMain.handle('writeFile', async (_event, filePath: string, content: string) => {
  assertVaultWritable()
  const safeFilePath = await resolvePathWithinVault(filePath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true })
    await fs.promises.writeFile(safeFilePath, content, 'utf-8')
    if (currentVaultPath) {
      await updateVaultSyncMetaForPath(currentVaultPath, safeFilePath)
    }
    return true
  } catch (err) {
    throw new Error(`Failed to write file: ${err}`)
  }
})

ipcMain.handle('createFolder', async (_event, dirPath: string) => {
  assertVaultWritable()
  const safeDirPath = await resolvePathWithinVault(dirPath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(safeDirPath, { recursive: true })
    return true
  } catch (err) {
    throw new Error(`Failed to create folder: ${err}`)
  }
})

ipcMain.handle('createNoteFolder', async (_event, vaultPath: string, folderRelativePath: string) => {
  assertVaultWritable()
  const resolvedVaultPath = await resolveKnownVaultPath(vaultPath)
  const notesRootPath = getVaultNotesPath(resolvedVaultPath)
  const safeDirPath = resolvePendingNotePath(notesRootPath, path.join(notesRootPath, folderRelativePath))
  await fs.promises.mkdir(safeDirPath, { recursive: true })
  return safeDirPath
})

ipcMain.handle('renameNoteItem', async (_event, oldPath: string, newPath: string) => {
  assertVaultWritable()
  if (!currentVaultPath) {
    throw new Error('Vault not selected')
  }

  const notesRootPath = getVaultNotesPath(currentVaultPath)
  const safeOldPath = await resolveExistingNotePath(notesRootPath, oldPath)
  const safeNewPath = resolvePendingNotePath(notesRootPath, newPath)
  const stats = await fs.promises.stat(safeOldPath)
  await fs.promises.mkdir(path.dirname(safeNewPath), { recursive: true })
  await fs.promises.rename(safeOldPath, safeNewPath)
  const oldRelativePath = normalizeVaultRelativePath(currentVaultPath, safeOldPath)
  const newRelativePath = normalizeVaultRelativePath(currentVaultPath, safeNewPath)
  if (stats.isDirectory()) {
    await renameVaultSyncMetaEntries(currentVaultPath, oldRelativePath, newRelativePath)
  } else {
    await removeVaultSyncMetaForPath(currentVaultPath, oldRelativePath)
    await updateVaultSyncMetaForPath(currentVaultPath, safeNewPath)
  }
  return safeNewPath
})

ipcMain.handle('deleteNoteItem', async (_event, targetPath: string) => {
  assertVaultWritable()
  if (!currentVaultPath) {
    throw new Error('Vault not selected')
  }

  const notesRootPath = getVaultNotesPath(currentVaultPath)
  const safeTargetPath = await resolveExistingNotePath(notesRootPath, targetPath)
  const stats = await fs.promises.stat(safeTargetPath)
  const relativePath = normalizeVaultRelativePath(currentVaultPath, safeTargetPath)

  await fs.promises.rm(safeTargetPath, { recursive: true, force: true })

  if (stats.isDirectory()) {
    await removeVaultSyncMetaForPrefix(currentVaultPath, relativePath)
  } else {
    await removeVaultSyncMetaForPath(currentVaultPath, relativePath)
  }

  return true
})

ipcMain.handle('deleteVaultItem', async (_event, targetPath: string) => {
  assertVaultWritable()
  if (!currentVaultPath) {
    throw new Error('Vault not selected')
  }

  const safeTargetPath = await resolvePathWithinVault(targetPath)
  const stats = await fs.promises.stat(safeTargetPath)
  const relativePath = normalizeVaultRelativePath(currentVaultPath, safeTargetPath)

  await fs.promises.rm(safeTargetPath, { recursive: true, force: true })

  if (stats.isDirectory()) {
    await removeVaultSyncMetaForPrefix(currentVaultPath, relativePath)
  } else {
    await removeVaultSyncMetaForPath(currentVaultPath, relativePath)
  }

  return true
})

/** Open native file-select dialog for images/media */
ipcMain.handle('selectFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const selectedFilePath = await resolveExistingFile(result.filePaths[0])
  lastSelectedFilePath = selectedFilePath
  return selectedFilePath
})

/** Write binary data (Buffer) to a file */
ipcMain.handle('writeBinaryFile', async (_event, filePath: string, data: ArrayBuffer) => {
  assertVaultWritable()
  const safeFilePath = await resolvePathWithinVault(filePath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true })
    await fs.promises.writeFile(safeFilePath, new Uint8Array(data))
    if (currentVaultPath) {
      await updateVaultSyncMetaForPath(currentVaultPath, safeFilePath)
    }
    return true
  } catch (err) {
    throw new Error(`Failed to write binary file: ${err}`)
  }
})

/** Copy a file from source to destination */
ipcMain.handle('copyFile', async (_event, srcPath: string, destPath: string) => {
  assertVaultWritable()
  const safeSrcPath = await resolveExistingFile(srcPath)
  if (!lastSelectedFilePath || normalizeForCompare(safeSrcPath) !== normalizeForCompare(lastSelectedFilePath)) {
    throw new Error('Access denied: source file was not selected by the user')
  }
  const safeDestPath = await resolvePathWithinVault(destPath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeDestPath), { recursive: true })
    await fs.promises.copyFile(safeSrcPath, safeDestPath)
    if (currentVaultPath) {
      await updateVaultSyncMetaForPath(currentVaultPath, safeDestPath)
    }
    return true
  } catch (err) {
    throw new Error(`Failed to copy file: ${err}`)
  }
})

ipcMain.handle('initVault', async (_event, vaultPath: string, userId: string) => {
  const resolvedVaultPath = await resolveKnownVaultPath(vaultPath)
  return initVaultMetadata(resolvedVaultPath, userId)
})

ipcMain.handle('checkVaultOwnership', async (_event, vaultPath: string, userId: string) => {
  return checkVaultOwnership(vaultPath, userId)
})

ipcMain.handle('cloneVault', async (_event, sourcePath: string, userId: string) => {
  const clonePath = await cloneVaultDirectory(sourcePath, userId)
  currentVaultReadOnly = false
  await rememberAuthorizedVaultPath(clonePath)
  return clonePath
})


// ── Window controls ───────────────────────────────────
// ── Gemini AI Flashcard Generation ────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_FLASHCARD_MODEL = 'llama-3.3-70b-versatile'
const GROQ_FLASHCARD_MAX_TOKENS = 1024
const FLASHCARD_RETRY_DELAY_MS = 60_000

function countFlashcardWords(content: string): number {
  const trimmed = content.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function targetCardsForWordCount(wordCount: number): number {
  return Math.max(3, Math.ceil(wordCount / 100))
}

function buildGeminiPrompt(notes: { name: string; content: string }[]): string {
  const notesSerialized = notes
    .map((n, i) => {
      const wordCount = countFlashcardWords(n.content)
      const targetCards = targetCardsForWordCount(wordCount)
      return `--- Note ${i + 1}: ${n.name} ---
Word count: ${wordCount}
Required flashcards: ${targetCards}
${n.content}`
    })
    .join('\n\n')

  return `You are a flashcard generator. For each note below, generate exactly the required number of flashcards listed in that note header.

Each flashcard must have a "front" (question or prompt) and a "back" (answer or explanation).
Use terms and phrasing directly from the note content whenever possible.
If a note already contains short Q&A-style content, reuse it as the flashcard front/back instead of rewriting it.
The required flashcard count is at least 3 per note and at least 1 card per 100 words. Follow the required count strictly for every note.
Return ONLY a raw JSON array with no extra text, no markdown fences, and no explanation. The format must be exactly:
[{ "front": "...", "back": "..." }]

Here are the notes:

${notesSerialized}`
}

function stripGeminiCodeFences(text: string): string {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')
  return cleaned.trim()
}

function extractJsonArrayCandidate(text: string): string {
  const cleaned = stripGeminiCodeFences(text)
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.slice(firstBracket, lastBracket + 1)
  }
  return cleaned
}

function decodePossiblyBrokenJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`)
  } catch {
    try {
      return JSON.parse(
        `"${value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\r/g, '\\r')
          .replace(/\n/g, '\\n')
          .replace(/\t/g, '\\t')}"`
      )
    } catch {
      return value.replace(/\s+/g, ' ').trim()
    }
  }
}

function parseFlashcardArrayFromText(text: string): { front: string; back: string }[] {
  const candidate = extractJsonArrayCandidate(text)

  try {
    const parsed: unknown = JSON.parse(candidate)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (card: unknown): card is { front: string; back: string } =>
          typeof card === 'object' &&
          card !== null &&
          typeof (card as { front?: unknown }).front === 'string' &&
          typeof (card as { back?: unknown }).back === 'string'
      )
    }
  } catch {
    // Fall through to relaxed parsing for malformed JSON strings from the model.
  }

  const relaxedPattern =
    /"front"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"back"\s*:\s*"((?:\\.|[^"\\])*)"/g
  const relaxedCards: { front: string; back: string }[] = []
  let match: RegExpExecArray | null

  while ((match = relaxedPattern.exec(candidate)) !== null) {
    relaxedCards.push({
      front: decodePossiblyBrokenJsonString(match[1] ?? ''),
      back: decodePossiblyBrokenJsonString(match[2] ?? '')
    })
  }

  return relaxedCards
}

function shouldRetryWithDelay(status: number, message: string | null): boolean {
  if (status === 429) {
    return true
  }

  const normalized = message?.toLowerCase() ?? ''
  return (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('too many pending') ||
    normalized.includes('please try again') ||
    normalized.includes('capacity')
  )
}

function parseGeminiErrorMessage(rawResponseText: string): string | null {
  try {
    const parsed = JSON.parse(rawResponseText)
    const message = parsed?.error?.message
    return typeof message === 'string' && message.trim() ? message.trim() : null
  } catch {
    return null
  }
}

async function generateGeminiChunk(
  notes: { name: string; content: string }[],
  apiKey: string
): Promise<{ front: string; back: string }[]> {
  const prompt = buildGeminiPrompt(notes)
  console.log('API key length:', apiKey?.length)
  console.log('Using Groq model:', GROQ_FLASHCARD_MODEL)
  console.log('Sending chunk with notes:', notes.map(n => n.name))

  let lastError: Error | null = null
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(`Retry attempt ${attempt} in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: GROQ_FLASHCARD_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: GROQ_FLASHCARD_MAX_TOKENS
        })
      })

      const rawResponseText = await response.text()

      if (!response.ok) {
        const apiMessage = parseGeminiErrorMessage(rawResponseText)
        if (attempt < maxRetries && shouldRetryWithDelay(response.status, apiMessage)) {
          console.warn(`Groq asked us to slow down. Waiting ${FLASHCARD_RETRY_DELAY_MS / 1000}s before retrying...`)
          await new Promise((resolve) => setTimeout(resolve, FLASHCARD_RETRY_DELAY_MS))
          continue
        }
        const errorMsg = apiMessage
          ? `Groq API error: ${response.status} ${response.statusText} - ${apiMessage}`
          : `Groq API error: ${response.status} ${response.statusText}`
        console.error(errorMsg)
        throw new Error(errorMsg)
      }

      const data = JSON.parse(rawResponseText)
      const rawText: string | undefined = data?.choices?.[0]?.message?.content

      if (!rawText) {
        throw new Error('Groq returned no text content')
      }

      const parsed = parseFlashcardArrayFromText(rawText)
      if (parsed.length === 0) {
        throw new Error('AI response could not be parsed into flashcards')
      }

      return parsed
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (
        (lastError.message.includes('fetch') ||
          lastError.message.toLowerCase().includes('network')) &&
        attempt < maxRetries
      ) {
        continue
      }
      console.error('Failed to generate or parse flashcard chunk. Full error object:', lastError)
      throw lastError
    }
  }

  throw lastError
}

ipcMain.handle(
  'ai:generate',
  async (
    _event,
    payload: {
      notes: { name: string; content: string }[]
      apiKey: string
    }
  ) => {
    const { notes, apiKey } = payload
    if (!notes || notes.length === 0 || !apiKey.trim()) {
      return []
    }

    // The frontend already prepares word-limited note chunks, so process the payload directly.
    return await generateGeminiChunk(notes, apiKey)
  }
)

ipcMain.on('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// ── App lifecycle ─────────────────────────────────────

app.whenReady().then(async () => {
  protocol.handle('local-file', async (request) => {
    let filePath: string
    try {
      filePath = await resolvePathWithinVault(resolveLocalFilePath(request.url))
    } catch {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const stats = await fs.promises.stat(filePath)
      const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>
      return new Response(stream, {
        headers: {
          'Content-Type': getMimeType(filePath),
          'Content-Length': String(stats.size)
        }
      })
    } catch (error) {
      console.error('local-file missing:', { requestUrl: request.url, resolvedPath: filePath, error })
      return new Response('Not Found', { status: 404 })
    }
  })

  electronApp.setAppUserModelId('com.netherite')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await ensureNetheriteAppDataDirectories()
  await loadAuthorizedVaultPaths()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
