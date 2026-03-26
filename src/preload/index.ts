import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('selectFolder'),
  activateVault: (vaultPath: string) => ipcRenderer.invoke('activateVault', vaultPath),
  createVault: (parentPath: string, vaultName: string, welcomeContent: string) =>
    ipcRenderer.invoke('createVault', parentPath, vaultName, welcomeContent),
  readFolder: (dirPath: string, options?: { includeMarkdownContent?: boolean }) =>
    ipcRenderer.invoke('readFolder', dirPath, options),
  readFile: (filePath: string) => ipcRenderer.invoke('readFile', filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke('fileExists', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('writeFile', filePath, content),
  createFolder: (dirPath: string) => ipcRenderer.invoke('createFolder', dirPath),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('selectFile', filters),
  writeBinaryFile: (filePath: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('writeBinaryFile', filePath, data),
  copyFile: (srcPath: string, destPath: string) =>
    ipcRenderer.invoke('copyFile', srcPath, destPath),
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
})
