import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'

const ALLOWED_SCHEMES = ['https:', 'http:']
let currentVaultPath: string | null = null
let lastSelectedFilePath: string | null = null
const authorizedVaultPaths = new Set<string>()
const selectedDirectoryPaths = new Set<string>()

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

const normalizeForCompare = (filePath: string) => {
  const normalized = normalizeFsPath(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

const isPathInside = (rootPath: string, candidatePath: string) => {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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
  await fs.promises.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8')
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

const assertInsideVault = (filePath: string) => {
  if (!isInsideVault(filePath)) {
    throw new Error('Access denied: outside vault')
  }
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
  async (_event, requestedPath: string) => {
    const resolvedPath = await resolveExistingDirectory(requestedPath)
    const normalizedPath = normalizeForCompare(resolvedPath)
    if (
      !authorizedVaultPaths.has(normalizedPath) &&
      !selectedDirectoryPaths.has(normalizedPath)
    ) {
      throw new Error('Access denied: vault was not selected by the user')
    }

    currentVaultPath = resolvedPath
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
    await fs.promises.writeFile(path.join(vaultPath, 'notes', 'Welcome.md'), welcomeContent, 'utf-8')

    const resolvedVaultPath = await resolveExistingDirectory(vaultPath)
    currentVaultPath = resolvedVaultPath
    await rememberAuthorizedVaultPath(resolvedVaultPath)
    return resolvedVaultPath
  }
)

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
  const safeFilePath = await resolvePathWithinVault(filePath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true })
    await fs.promises.writeFile(safeFilePath, content, 'utf-8')
    return true
  } catch (err) {
    throw new Error(`Failed to write file: ${err}`)
  }
})

ipcMain.handle('createFolder', async (_event, dirPath: string) => {
  const safeDirPath = await resolvePathWithinVault(dirPath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(safeDirPath, { recursive: true })
    return true
  } catch (err) {
    throw new Error(`Failed to create folder: ${err}`)
  }
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
  const safeFilePath = await resolvePathWithinVault(filePath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeFilePath), { recursive: true })
    await fs.promises.writeFile(safeFilePath, new Uint8Array(data))
    return true
  } catch (err) {
    throw new Error(`Failed to write binary file: ${err}`)
  }
})

/** Copy a file from source to destination */
ipcMain.handle('copyFile', async (_event, srcPath: string, destPath: string) => {
  const safeSrcPath = await resolveExistingFile(srcPath)
  if (!lastSelectedFilePath || normalizeForCompare(safeSrcPath) !== normalizeForCompare(lastSelectedFilePath)) {
    throw new Error('Access denied: source file was not selected by the user')
  }
  const safeDestPath = await resolvePathWithinVault(destPath, { allowMissingLeaf: true })
  try {
    await fs.promises.mkdir(path.dirname(safeDestPath), { recursive: true })
    await fs.promises.copyFile(safeSrcPath, safeDestPath)
    return true
  } catch (err) {
    throw new Error(`Failed to copy file: ${err}`)
  }
})

// ── Window controls ───────────────────────────────────
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
