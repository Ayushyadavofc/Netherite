export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  readFolder: (dirPath: string) => Promise<FsNode[]>
  readFile: (filePath: string) => Promise<string>
  fileExists: (filePath: string) => Promise<boolean>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  createFolder: (dirPath: string) => Promise<boolean>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  writeBinaryFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
  copyFile: (srcPath: string, destPath: string) => Promise<boolean>
  minimize: () => void
  maximize: () => void
  close: () => void
}

export interface FsNode {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: FsNode[]
  content?: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
