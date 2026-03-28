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
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  writeBinaryFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
  copyFile: (srcPath: string, destPath: string) => Promise<boolean>
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
