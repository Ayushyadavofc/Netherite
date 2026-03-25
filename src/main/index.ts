import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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
  return result.filePaths[0]
})

/** Recursively scan a directory for .md files and subdirectories */
interface FsNode {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: FsNode[]
  content?: string
}

function scanDirectorySync(dirPath: string, relativeTo: string): FsNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const nodes: FsNode[] = []
  const indexedExt = new Set(['md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a'])

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      const children = scanDirectorySync(fullPath, relativeTo)
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
      if (ext === 'md') {
        node.content = fs.readFileSync(fullPath, 'utf-8')
      }
      nodes.push(node)
    }
  }

  // Sort: folders first, then files, alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

ipcMain.handle('readFolder', async (_event, dirPath: string) => {
  try {
    return scanDirectorySync(dirPath, dirPath)
  } catch (err) {
    console.error('readFolder error:', err)
    return []
  }
})

ipcMain.handle('readFile', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    console.error('readFile error:', err)
    return ''
  }
})

ipcMain.handle('fileExists', async (_event, filePath: string) => {
  try {
    return fs.existsSync(filePath)
  } catch (err) {
    console.error('fileExists error:', err)
    return false
  }
})

ipcMain.handle('writeFile', async (_event, filePath: string, content: string) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (err) {
    console.error('writeFile error:', err)
    return false
  }
})

ipcMain.handle('createFolder', async (_event, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return true
  } catch (err) {
    console.error('createFolder error:', err)
    return false
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
  return result.filePaths[0]
})

/** Write binary data (Buffer) to a file */
ipcMain.handle('writeBinaryFile', async (_event, filePath: string, data: ArrayBuffer) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, Buffer.from(data))
    return true
  } catch (err) {
    console.error('writeBinaryFile error:', err)
    return false
  }
})

/** Copy a file from source to destination */
ipcMain.handle('copyFile', async (_event, srcPath: string, destPath: string) => {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(srcPath, destPath)
    return true
  } catch (err) {
    console.error('copyFile error:', err)
    return false
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

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    let urlPath = request.url.replace('local-file://', '')
    urlPath = decodeURIComponent(urlPath)
    if (urlPath.startsWith('/C:')) {
      urlPath = urlPath.slice(1)
    }
    return net.fetch(pathToFileURL(urlPath).toString())
  })

  electronApp.setAppUserModelId('com.netherite')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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
