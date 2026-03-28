import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Maximize2,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PenTool,
  Plus,
  Search,
  Square
} from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Toaster, toast } from 'sonner'

import { AdvancedCanvas } from '../ui/AdvancedCanvas'
import { GraphView } from './GraphView'
import { ObsidianMarkdownEditor, type MarkdownEditorHandle } from './ObsidianMarkdownEditor'
import {
  buildGeneratedAttachmentName,
  buildImportedAttachmentName,
  detectAttachmentKind,
  detectAttachmentKindFromMime,
  normalizePath,
  resolveAttachmentKind,
  type AttachmentItem
} from '@/lib/attachments'

interface FsNode {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: FsNode[]
  content?: string
}

interface NoteRecord {
  id: string
  title: string
  content: string
  folder: string
  path: string
  fullPath: string
  linkable: boolean
  updatedAt: string
  openedAt: string
}

interface FolderRecord {
  name: string
  expanded: boolean
  noteIds: string[]
}

interface ContextMenuState {
  x: number
  y: number
}

interface GraphNode {
  id: string
  label: string
}

interface GraphEdge {
  from: string
  to: string
}

const RESERVED_FOLDERS = new Set(['notes', 'flashcards', 'settings', 'attachments', '.netherite'])
const OUTSIDE_JUNK = 'outside junk'
const ACTIVE_NOTE_PATH_KEY = 'netherite-active-note-path'
const ACTIVE_NOTE_EDITING_KEY = 'netherite-active-note-editing'
const ACTIVE_NOTE_CONTENT_KEY = 'netherite-active-note-content'

const normalizeAbsolutePath = (value: string) => normalizePath(value).replace(/\/+$/, '')

const syncWorkspaceState = (key: string, value: string | null, options?: { emit?: boolean }) => {
  if (value === null) {
    window.localStorage.removeItem(key)
  } else {
    window.localStorage.setItem(key, value)
  }

  if (options?.emit) {
    window.dispatchEvent(new Event('local-storage'))
  }
}

const joinPath = (basePath: string, relativePath = '') => {
  const normalizedBase = normalizeAbsolutePath(basePath)
  const normalizedRelative = normalizePath(relativePath).replace(/^\/+/, '')
  return normalizedRelative ? `${normalizedBase}/${normalizedRelative}` : normalizedBase
}

const getDisplayDate = () =>
  new Date().toLocaleString(void 0, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

const slugifyBaseName = (name: string) =>
  name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Untitled Note'

const formatFolderLabel = (name: string) =>
  name
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[-_]+/g, ' ')
    .trim() || name

const parseHeadings = (content: string) =>
  content
    .split('\n')
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)/)
      if (!match) {
        return null
      }

      return {
        level: match[1].length,
        text: match[2],
        lineIndex: index
      }
    })
    .filter((item): item is { level: number; text: string; lineIndex: number } => item !== null)

const parseNoteLinks = (content: string) => {
  const links: string[] = []
  const regex = /!?\[\[([^\n]*?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match[0].startsWith('![[')) {
      continue
    }

    links.push(match[1].trim())
  }

  return links
}

const buildGraph = (notes: NoteRecord[]): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const linkableNotes = notes.filter((note) => note.linkable)
  const titleToId = new Map(linkableNotes.map((note) => [note.title.toLowerCase(), note.id]))
  const nodes = linkableNotes.map((note) => ({ id: note.id, label: note.title }))
  const edges: GraphEdge[] = []

  for (const note of linkableNotes) {
    for (const title of parseNoteLinks(note.content)) {
      const targetId = titleToId.get(title.toLowerCase())
      if (targetId && targetId !== note.id) {
        edges.push({ from: note.id, to: targetId })
      }
    }
  }

  return { nodes, edges }
}

const getCurrentVaultPath = () => window.localStorage.getItem('netherite-current-vault-path')
const getNotesRootPath = (vaultPath: string) => joinPath(vaultPath, 'notes')
const getNotesInnerPath = (notePath: string) => normalizePath(notePath).replace(/^notes\//i, '')

const getParentRelativePath = (relativePath: string) => {
  const normalizedPath = normalizePath(relativePath).replace(/^\/+|\/+$/g, '')
  const lastSlash = normalizedPath.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash)
}

const buildAncestorFolderPaths = (relativePath: string) => {
  const normalizedPath = normalizePath(relativePath).replace(/^\/+|\/+$/g, '')
  if (!normalizedPath) {
    return []
  }

  const parts = normalizedPath.split('/').filter(Boolean)
  const ancestors: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index + 1).join('/'))
  }

  return ancestors
}

const collectFolderPaths = (nodes: FsNode[]) => {
  const folderPaths = new Set<string>([''])

  const visit = (items: FsNode[]) => {
    for (const item of items) {
      if (item.type !== 'folder') {
        continue
      }

      folderPaths.add(normalizePath(item.path))
      visit(item.children ?? [])
    }
  }

  visit(nodes)
  return folderPaths
}

const collectNoteTreeNodes = (
  nodes: FsNode[],
  visibleNoteIds: Set<string>,
  noteByInnerPath: Map<string, NoteRecord>,
  keepEmptyFolders: boolean
): FsNode[] =>
  nodes
    .map((node) => {
      if (node.type === 'folder') {
        const children: FsNode[] = collectNoteTreeNodes(
          node.children ?? [],
          visibleNoteIds,
          noteByInnerPath,
          keepEmptyFolders
        )
        if (children.length === 0 && !keepEmptyFolders) {
          return null
        }

        return {
          ...node,
          children
        }
      }

      const note = noteByInnerPath.get(normalizePath(node.path))
      if (!note || !visibleNoteIds.has(note.id)) {
        return null
      }

      return node
    })
    .filter((node): node is FsNode => node !== null)

export function Workspace() {
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [notesTree, setNotesTree] = useState<FsNode[]>([])
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedFolderRelativePath, setSelectedFolderRelativePath] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeRightTab, setActiveRightTab] = useState<'Outline' | 'Graph'>('Outline')
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showGraphModal, setShowGraphModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showCanvas, setShowCanvas] = useState(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [dropTargetFolderPath, setDropTargetFolderPath] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const saveTimerRef = useRef<number | null>(null)
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const lastOpenedNoteIdRef = useRef<string | null>(null)
  const selectedNotePathRef = useRef<string | null>(null)
  const selectedFolderPathRef = useRef('')
  const folderExpansionRef = useRef<Map<string, boolean>>(new Map())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
    selectedNotePathRef.current = selectedNote?.fullPath ?? null
  }, [notes, selectedNoteId])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  )

  useEffect(() => {
    if (selectedNote?.linkable && selectedNote.fullPath) {
      syncWorkspaceState(ACTIVE_NOTE_PATH_KEY, normalizeAbsolutePath(selectedNote.fullPath))
      return
    }

    syncWorkspaceState(ACTIVE_NOTE_PATH_KEY, null)
  }, [selectedNote?.fullPath, selectedNote?.linkable])

  useEffect(() => {
    if (!selectedNote?.linkable) {
      syncWorkspaceState(ACTIVE_NOTE_EDITING_KEY, 'false')
      syncWorkspaceState(ACTIVE_NOTE_CONTENT_KEY, null)
      return
    }

    syncWorkspaceState(ACTIVE_NOTE_EDITING_KEY, editedContent !== selectedNote.content ? 'true' : 'false')
    syncWorkspaceState(ACTIVE_NOTE_CONTENT_KEY, editedContent)
  }, [editedContent, selectedNote])

  useEffect(() => {
    selectedFolderPathRef.current = selectedFolderRelativePath
  }, [selectedFolderRelativePath])

  useEffect(() => {
    folderExpansionRef.current = new Map(folders.map((folder) => [folder.name, folder.expanded]))
  }, [folders])

  const linkableNotes = useMemo(() => notes.filter((note) => note.linkable), [notes])
  const linkableNoteTitles = useMemo(() => linkableNotes.map((note) => note.title), [linkableNotes])

  const loadVault = useCallback(
    async (preferredNotePath?: string | null, preferredFolderRelativePath?: string | null) => {
      const vaultPath = getCurrentVaultPath()
      if (!vaultPath) {
        setNotes([])
        setFolders([])
        setNotesTree([])
        setAttachments([])
        setSelectedNoteId(null)
        setSelectedFolderRelativePath('')
        setEditedContent('')
        return
      }

      const [vaultNodes, noteNodes] = await Promise.all([
        window.electronAPI.readFolder(vaultPath, { includeMarkdownContent: true }),
        window.electronAPI.readFolder(getNotesRootPath(vaultPath), { includeMarkdownContent: false })
      ])

      const loadedNotes: NoteRecord[] = []
      const folderMap = new Map<string, string[]>()
      const loadedAttachments: AttachmentItem[] = []

      const pushFolderNote = (folderName: string, noteId: string) => {
        const existing = folderMap.get(folderName) ?? []
        existing.push(noteId)
        folderMap.set(folderName, existing)
      }

      const visit = (nodes: FsNode[]) => {
        for (const node of nodes) {
          const relativePath = normalizePath(node.path)
          if (node.type === 'folder') {
            visit(node.children ?? [])
            continue
          }

          const lowerPath = relativePath.toLowerCase()
          if (lowerPath.endsWith('.md')) {
            const fullPath = joinPath(vaultPath, relativePath)
            const noteId = fullPath
            const insideNotes = lowerPath.startsWith('notes/')
            const insideReserved = Array.from(RESERVED_FOLDERS).some(
              (folder) => lowerPath.startsWith(`${folder}/`) || lowerPath === folder
            )

            if (insideNotes) {
              const innerPath = getNotesInnerPath(relativePath)
              const pathParts = innerPath.split('/').filter(Boolean)
              const folderName = pathParts.length > 1 ? pathParts[0] : 'notes'

              loadedNotes.push({
                id: noteId,
                title: node.name.replace(/\.md$/i, ''),
                content: node.content || '',
                folder: folderName,
                path: relativePath,
                fullPath,
                linkable: true,
                updatedAt: 'Loaded',
                openedAt: 'Loaded'
              })
              pushFolderNote(folderName, noteId)
              continue
            }

            if (!insideReserved) {
              loadedNotes.push({
                id: noteId,
                title: node.name.replace(/\.md$/i, ''),
                content: node.content || '',
                folder: OUTSIDE_JUNK,
                path: relativePath,
                fullPath,
                linkable: false,
                updatedAt: 'Loaded',
                openedAt: 'Loaded'
              })
              pushFolderNote(OUTSIDE_JUNK, noteId)
            }
            continue
          }

          if (lowerPath.startsWith('attachments/')) {
            loadedAttachments.push({
              name: node.name,
              fullPath: joinPath(vaultPath, relativePath),
              relativePath,
              kind: detectAttachmentKind(node.name)
            })
          }
        }
      }

      visit(vaultNodes)

      loadedNotes.sort((left, right) => left.title.localeCompare(right.title))
      loadedAttachments.sort((left, right) => left.name.localeCompare(right.name))

      const preferredNote = preferredNotePath ? normalizeAbsolutePath(preferredNotePath) : null
      const nextSelectedNote =
        loadedNotes.find((note) => normalizeAbsolutePath(note.fullPath) === preferredNote) ??
        loadedNotes.find((note) => normalizeAbsolutePath(note.fullPath) === selectedNotePathRef.current) ??
        loadedNotes[0] ??
        null

      const folderPaths = collectFolderPaths(noteNodes)
      const derivedFolderPath = nextSelectedNote?.linkable
        ? getParentRelativePath(getNotesInnerPath(nextSelectedNote.path))
        : ''
      const requestedFolderPath = preferredFolderRelativePath ?? selectedFolderPathRef.current ?? derivedFolderPath
      const expandedPaths = new Set<string>(['notes', OUTSIDE_JUNK])
      buildAncestorFolderPaths(requestedFolderPath).forEach((path) => expandedPaths.add(path))

      const nextFolders: FolderRecord[] = []

      Array.from(folderPaths.values())
        .filter((path) => path)
        .sort((left, right) => left.localeCompare(right))
        .forEach((path) => {
          nextFolders.push({
            name: path,
            expanded: folderExpansionRef.current.get(path) ?? expandedPaths.has(path),
            noteIds: []
          })
        })

      const outsideJunkIds = folderMap.get(OUTSIDE_JUNK) ?? []
      if (outsideJunkIds.length > 0) {
        nextFolders.push({
          name: OUTSIDE_JUNK,
          expanded: folderExpansionRef.current.get(OUTSIDE_JUNK) ?? true,
          noteIds: outsideJunkIds
        })
      }

      setNotes(loadedNotes)
      setFolders(nextFolders)
      setNotesTree(noteNodes)
      setAttachments(loadedAttachments)
      setSelectedFolderRelativePath(folderPaths.has(requestedFolderPath) ? requestedFolderPath : derivedFolderPath)
      setSelectedNoteId(nextSelectedNote?.id ?? null)
      setEditedContent(nextSelectedNote?.content ?? '')
    },
    []
  )

  useEffect(() => {
    void loadVault()
  }, [loadVault])

  useEffect(() => {
    const syncWorkspace = () => {
      void loadVault()
    }

    window.addEventListener('storage', syncWorkspace)
    window.addEventListener('local-storage', syncWorkspace)

    return () => {
      window.removeEventListener('storage', syncWorkspace)
      window.removeEventListener('local-storage', syncWorkspace)
    }
  }, [loadVault])

  useEffect(() => {
    return () => {
      syncWorkspaceState(ACTIVE_NOTE_PATH_KEY, null)
      syncWorkspaceState(ACTIVE_NOTE_EDITING_KEY, 'false')
      syncWorkspaceState(ACTIVE_NOTE_CONTENT_KEY, null)
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((current) => current + 1), 1000)
    } else {
      setRecordingTime(0)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isRecording])

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const saveNote = useCallback(async (note: NoteRecord, content: string) => {
    try {
      await window.electronAPI.writeFile(note.fullPath, content)
      setNotes((currentNotes) =>
        currentNotes.map((item) =>
          item.id === note.id ? { ...item, content, updatedAt: 'Just now' } : item
        )
      )
    } catch (error) {
      toast.error('Save failed, your changes may not have been written to disk.')
      console.error(error)
    }
  }, [])

  const scheduleSave = useCallback(
    (note: NoteRecord, content: string) => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = window.setTimeout(() => {
        void saveNote(note, content)
      }, 500)
    },
    [saveNote]
  )

  const updateNoteContent = useCallback(
    (content: string) => {
      setEditedContent(content)
      if (!selectedNote) {
        return
      }

      scheduleSave(selectedNote, content)
    },
    [scheduleSave, selectedNote]
  )

  const toggleTopLevelFolder = (folderName: string) => {
    setFolders((current) =>
      current.map((folder) => (folder.name === folderName ? { ...folder, expanded: !folder.expanded } : folder))
    )
  }

  const openNote = useCallback((note: NoteRecord) => {
    setSelectedNoteId(note.id)
    setEditedContent(note.content)
    if (note.linkable) {
      setSelectedFolderRelativePath(getParentRelativePath(getNotesInnerPath(note.path)))
    } else {
      setSelectedFolderRelativePath('')
    }

    if (lastOpenedNoteIdRef.current === note.id) {
      return
    }

    lastOpenedNoteIdRef.current = note.id
    const openedAt = getDisplayDate()
    setNotes((current) => current.map((item) => (item.id === note.id ? { ...item, openedAt } : item)))
  }, [])

  const ensureUniqueAttachmentName = useCallback(async (originalName: string) => {
    const vaultPath = getCurrentVaultPath()
    if (!vaultPath) {
      return originalName
    }

    const lastDot = originalName.lastIndexOf('.')
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot)
    const extension = lastDot === -1 ? '' : originalName.slice(lastDot)

    let candidate = originalName
    let counter = 1
    while (await window.electronAPI.fileExists(joinPath(vaultPath, `attachments/${candidate}`))) {
      candidate = `${baseName}-${counter}${extension}`
      counter += 1
    }

    return candidate
  }, [])

  const registerAttachment = useCallback((name: string, fullPath: string, kind?: AttachmentItem['kind']) => {
    setAttachments((current) => {
      if (current.some((item) => item.fullPath === fullPath)) {
        return current
      }

      return [
        ...current,
        {
          name,
          fullPath,
          relativePath: `attachments/${name}`,
          kind: resolveAttachmentKind(name, kind)
        }
      ].sort((left, right) => left.name.localeCompare(right.name))
    })
  }, [])

  const importAttachmentFile = useCallback(
    async (file: File, source: 'paste' | 'drop' = 'paste') => {
      const vaultPath = getCurrentVaultPath()
      if (!vaultPath) {
        return null
      }

      await window.electronAPI.createFolder(`${vaultPath}/attachments`)
      const attachmentKind = detectAttachmentKindFromMime(file.type)
      const generatedName = buildImportedAttachmentName(file, source)
      const finalName = await ensureUniqueAttachmentName(generatedName)
      const fullPath = `${vaultPath}/attachments/${finalName}`
      const buffer = await file.arrayBuffer()

      await window.electronAPI.writeBinaryFile(fullPath, buffer)
      registerAttachment(finalName, fullPath, attachmentKind)
      return finalName
    },
    [ensureUniqueAttachmentName, registerAttachment]
  )

  const pickAttachmentFromDisk = useCallback(async () => {
    const vaultPath = getCurrentVaultPath()
    if (!vaultPath) {
      return
    }

    await window.electronAPI.createFolder(`${vaultPath}/attachments`)
    const filePath = await window.electronAPI.selectFile([{ name: 'All Files', extensions: ['*'] }])
    if (!filePath) {
      return
    }

    const originalName = normalizePath(filePath).split('/').pop() || `file-${Date.now()}`
    const finalName = await ensureUniqueAttachmentName(originalName)
    const destination = `${vaultPath}/attachments/${finalName}`

    await window.electronAPI.copyFile(filePath, destination)
    registerAttachment(finalName, destination)
    editorRef.current?.insertWikilink(finalName, true)
  }, [ensureUniqueAttachmentName, registerAttachment])

  const toggleAudioRecording = useCallback(async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const vaultPath = getCurrentVaultPath()
        if (!vaultPath) {
          return
        }

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = recorder.mimeType.includes('ogg') ? '.ogg' : '.webm'
        const originalName = buildGeneratedAttachmentName('Recorded audio', extension)
        const finalName = await ensureUniqueAttachmentName(originalName)
        const fullPath = `${vaultPath}/attachments/${finalName}`
        const buffer = await blob.arrayBuffer()

        await window.electronAPI.createFolder(`${vaultPath}/attachments`)
        await window.electronAPI.writeBinaryFile(fullPath, buffer)
        registerAttachment(finalName, fullPath, 'audio')
        editorRef.current?.insertWikilink(finalName, true)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Mic access denied', error)
    }
  }, [ensureUniqueAttachmentName, isRecording, registerAttachment])

  const insertCanvasPages = useCallback(
    async (pages: string[]) => {
      const vaultPath = getCurrentVaultPath()
      if (!vaultPath || pages.length === 0) {
        return
      }

      await window.electronAPI.createFolder(`${vaultPath}/attachments`)
      const fileNames: string[] = []

      for (let index = 0; index < pages.length; index += 1) {
        const dataUrl = pages[index]
        const originalName = buildGeneratedAttachmentName(`Canvas page ${index + 1}`, '.png')
        const finalName = await ensureUniqueAttachmentName(originalName)
        const fullPath = `${vaultPath}/attachments/${finalName}`
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
        const binaryString = window.atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)

        for (let byteIndex = 0; byteIndex < binaryString.length; byteIndex += 1) {
          bytes[byteIndex] = binaryString.charCodeAt(byteIndex)
        }

        await window.electronAPI.writeBinaryFile(fullPath, bytes.buffer)
        registerAttachment(finalName, fullPath, 'image')
        fileNames.push(finalName)
      }

      editorRef.current?.insertSnippet(`\n${fileNames.map((name) => `![[${name}]]`).join('\n\n')}\n`)
      setShowCanvas(false)
    },
    [ensureUniqueAttachmentName, registerAttachment]
  )

  const openNoteByTitle = useCallback(
    (title: string) => {
      const note = notes.find((item) => item.linkable && item.title.toLowerCase() === title.toLowerCase())
      if (note) {
        openNote(note)
      }
    },
    [notes, openNote]
  )

  const createNote = useCallback(async () => {
    const vaultPath = getCurrentVaultPath()
    if (!vaultPath) {
      return
    }

    await window.electronAPI.createFolder(`${vaultPath}/notes`)

    const existingTitles = new Set(
      notes.filter((note) => note.linkable).map((note) => note.title.toLowerCase())
    )

    let index = 1
    const baseTitle = 'Untitled Note'
    let candidate = baseTitle
    while (existingTitles.has(candidate.toLowerCase())) {
      index += 1
      candidate = `${baseTitle} ${index}`
    }

    const safeTitle = slugifyBaseName(candidate)
    const folderPath = selectedFolderPathRef.current
    const innerRelativePath = folderPath ? `${folderPath}/${safeTitle}.md` : `${safeTitle}.md`
    const fullPath = `${vaultPath}/notes/${innerRelativePath}`
    const content = `# ${safeTitle}\n\n`

    try {
      await window.electronAPI.writeFile(fullPath, content)
      await loadVault(fullPath, folderPath)
    } catch (error) {
      toast.error('Save failed, your changes may not have been written to disk.')
      console.error(error)
    }
  }, [loadVault, notes])

  const createFolder = useCallback(async (folderNameValue: string) => {
    const vaultPath = getCurrentVaultPath()
    if (!vaultPath) {
      return
    }

    if (!folderNameValue.trim()) {
      return
    }

    const folderName = slugifyBaseName(folderNameValue)
    const baseFolder = selectedFolderPathRef.current
    const folderRelativePath = baseFolder ? `${baseFolder}/${folderName}` : folderName

    try {
      await window.electronAPI.createNoteFolder(vaultPath, folderRelativePath)
      await loadVault(undefined, folderRelativePath)
      setShowCreateFolderModal(false)
      setNewFolderName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this folder.')
      console.error(error)
    }
  }, [loadVault])

  const moveNoteToFolder = useCallback(
    async (note: NoteRecord, targetFolderPath: string) => {
      const vaultPath = getCurrentVaultPath()
      if (!vaultPath || !note.linkable) {
        return
      }

      const currentInnerPath = normalizePath(getNotesInnerPath(note.path))
      const currentFolderPath = getParentRelativePath(currentInnerPath)
      const noteFileName = currentInnerPath.split('/').pop()

      if (!noteFileName || currentFolderPath === targetFolderPath) {
        return
      }

      const nextRelativePath = targetFolderPath ? `${targetFolderPath}/${noteFileName}` : noteFileName
      const nextFullPath = joinPath(vaultPath, `notes/${nextRelativePath}`)

      try {
        if (await window.electronAPI.fileExists(nextFullPath)) {
          toast.error('A note with that name already exists in this folder.')
          return
        }

        await window.electronAPI.renameNoteItem(currentInnerPath, nextRelativePath)
        await loadVault(nextFullPath, targetFolderPath)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not move this note.')
        console.error(error)
      } finally {
        setDraggedNoteId(null)
        setDropTargetFolderPath(null)
      }
    },
    [loadVault]
  )

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return notes
    }

    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query)
    )
  }, [notes, searchQuery])

  const filteredNoteIds = useMemo(() => new Set(filteredNotes.map((note) => note.id)), [filteredNotes])
  const headings = useMemo(() => parseHeadings(editedContent), [editedContent])
  const graph = useMemo(() => buildGraph(notes), [notes])

  const expandedFolderMap = useMemo(
    () => new Map(folders.map((folder) => [folder.name, folder.expanded])),
    [folders]
  )

  const linkableNoteByInnerPath = useMemo(
    () =>
      new Map(
        notes
          .filter((note) => note.linkable)
          .map((note) => [normalizePath(getNotesInnerPath(note.path)), note] as const)
      ),
    [notes]
  )

  const visibleTreeNodes = useMemo(
    () =>
      collectNoteTreeNodes(
        notesTree,
        filteredNoteIds,
        linkableNoteByInnerPath,
        searchQuery.trim().length === 0
      ),
    [filteredNoteIds, linkableNoteByInnerPath, notesTree, searchQuery]
  )

  const outsideJunkFolder = useMemo(() => folders.find((folder) => folder.name === OUTSIDE_JUNK) ?? null, [folders])
  const visibleOutsideJunkNotes = useMemo(
    () =>
      (outsideJunkFolder?.noteIds ?? [])
        .map((noteId) => filteredNotes.find((note) => note.id === noteId))
        .filter((note): note is NoteRecord => Boolean(note))
        .sort((left, right) => left.title.localeCompare(right.title)),
    [filteredNotes, outsideJunkFolder]
  )

  const contextActions = [
    { label: 'Bold', action: () => editorRef.current?.wrapSelection('**') },
    { label: 'Italic', action: () => editorRef.current?.wrapSelection('*') },
    { label: 'Strikethrough', action: () => editorRef.current?.wrapSelection('~~') },
    { label: 'Bullet List', action: () => editorRef.current?.prefixSelectedLines('- ') },
    { label: 'Numbered List', action: () => editorRef.current?.prefixSelectedLines('1. ') },
    {
      label: 'Table',
      action: () =>
        editorRef.current?.insertSnippet(
          '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n| Value 3 | Value 4 |\n'
        )
    },
    {
      label: 'Flowchart',
      action: () =>
        editorRef.current?.insertSnippet(
          '```mermaid\nflowchart TD\n    A[Start] --> B[Next]\n    B --> C[Done]\n```\n'
        )
    },
    { label: 'Attach File', action: () => void pickAttachmentFromDisk() },
    {
      label: isRecording ? `Stop Recording (${recordingTime}s)` : 'Record Audio',
      action: () => void toggleAudioRecording()
    },
    { label: 'Sketch Canvas', action: () => setShowCanvas(true) }
  ]

  const renderTreeNodes = useCallback(
    (nodes: FsNode[], depth = 1): JSX.Element[] =>
      nodes.flatMap((node) => {
        if (node.type === 'folder') {
          const folderKey = normalizePath(node.path)
          const folderOpen = expandedFolderMap.get(folderKey) ?? false
          const isSelectedFolder = selectedFolderRelativePath === folderKey
          const isDropTarget = draggedNoteId !== null && dropTargetFolderPath === folderKey

          return [
            <div
              key={`folder-${folderKey}`}
              className="mb-1"
              onDragOver={(event) => {
                if (!draggedNoteId) {
                  return
                }

                event.stopPropagation()
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTargetFolderPath(folderKey)
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return
                }

                setDropTargetFolderPath((current) => (current === folderKey ? null : current))
              }}
              onDrop={(event) => {
                event.stopPropagation()
                event.preventDefault()
                const draggedNote = notes.find((item) => item.id === draggedNoteId && item.linkable)
                if (!draggedNote) {
                  setDraggedNoteId(null)
                  setDropTargetFolderPath(null)
                  return
                }

                void moveNoteToFolder(draggedNote, folderKey)
              }}
            >
              <button
                onClick={() => {
                  toggleTopLevelFolder(folderKey)
                  setSelectedFolderRelativePath(folderKey)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors ${
                  isDropTarget
                    ? 'bg-[rgba(255,183,125,0.14)] text-[#ffd4b1]'
                    : isSelectedFolder
                    ? 'bg-[#111111] text-[#ffcfaa]'
                    : 'text-[#ffb77d] hover:bg-[#111111] hover:text-[#ffd4b1]'
                }`}
                style={{ paddingLeft: `${depth * 14}px` }}
              >
                {folderOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Folder className="h-4 w-4" />
                <span>{formatFolderLabel(node.name)}</span>
              </button>
              {folderOpen && node.children ? (
                <div className="mt-1">{renderTreeNodes(node.children, depth + 1)}</div>
              ) : null}
            </div>
          ]
        }

        const note = linkableNoteByInnerPath.get(normalizePath(node.path))
        if (!note) {
          return []
        }

        const isActive = note.id === selectedNoteId
        const isDragging = note.id === draggedNoteId
        return [
          <button
            key={note.id}
            onClick={() => openNote(note)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', note.id)
              setDraggedNoteId(note.id)
              setDropTargetFolderPath(null)
            }}
            onDragEnd={() => {
              setDraggedNoteId(null)
              setDropTargetFolderPath(null)
            }}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              isActive
                ? 'bg-[rgba(255,86,37,0.12)] text-[#ff5625]'
                : 'text-[#c8c2be] hover:bg-[#111111] hover:text-white'
            } ${isDragging ? 'opacity-60' : ''}`}
            style={{ marginLeft: `${depth * 14}px` }}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{note.title}</span>
          </button>
        ]
      }),
    [
      draggedNoteId,
      dropTargetFolderPath,
      expandedFolderMap,
      linkableNoteByInnerPath,
      moveNoteToFolder,
      notes,
      openNote,
      selectedFolderRelativePath,
      selectedNoteId
    ]
  )

  return (
    <>
      <Toaster richColors theme="dark" />

      <div className="w-full h-full bg-[#0a0808]">
        <PanelGroup direction="horizontal">
          {showLeftPanel && (
            <>
              <Panel defaultSize={22} minSize={16} maxSize={34} className="flex flex-col border-r border-[#2a2422] bg-[#0a0808]">
                <div className="p-4">
                  <div className="mb-4 flex gap-2">
                    <button
                      onClick={() => void createNote()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgba(255,183,125,0.1)] px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#ffb77d] transition-colors hover:bg-[rgba(255,183,125,0.18)]"
                    >
                      <Plus className="h-4 w-4" />
                      <span>New Note</span>
                    </button>
                    <button
                      onClick={() => setShowCreateFolderModal(true)}
                      className="flex items-center justify-center rounded-xl bg-[rgba(255,183,125,0.1)] px-3 py-2 text-[#ffb77d] transition-colors hover:bg-[rgba(255,183,125,0.18)]"
                      title="New Folder"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-[#2a2422] bg-[#111111] px-3 py-2">
                    <Search className="h-4 w-4 text-[#666666]" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search notes..."
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#555555]"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-4">
                  <div
                    className={`mb-3 space-y-1 rounded-xl transition-colors ${
                      draggedNoteId !== null && dropTargetFolderPath === ''
                        ? 'bg-[rgba(255,183,125,0.08)]'
                        : ''
                    }`}
                    onDragOver={(event) => {
                      if (!draggedNoteId) {
                        return
                      }

                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setDropTargetFolderPath('')
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        return
                      }

                      setDropTargetFolderPath((current) => (current === '' ? null : current))
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const draggedNote = notes.find((item) => item.id === draggedNoteId && item.linkable)
                      if (!draggedNote) {
                        setDraggedNoteId(null)
                        setDropTargetFolderPath(null)
                        return
                      }

                      void moveNoteToFolder(draggedNote, '')
                    }}
                  >
                    {renderTreeNodes(visibleTreeNodes, 0)}
                  </div>

                  {outsideJunkFolder && (visibleOutsideJunkNotes.length > 0 || !searchQuery.trim()) && (
                    <div className="mb-3">
                      <button
                        onClick={() => toggleTopLevelFolder(OUTSIDE_JUNK)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-[#ffb77d] transition-colors hover:bg-[#111111] hover:text-[#ffd4b1]"
                      >
                        {outsideJunkFolder.expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Folder className="h-4 w-4" />
                        <span>{formatFolderLabel(outsideJunkFolder.name)}</span>
                      </button>

                      {outsideJunkFolder.expanded && (
                        <div className="mt-1 space-y-1">
                          {visibleOutsideJunkNotes.map((note) => {
                            const isActive = note.id === selectedNoteId
                            return (
                              <button
                                key={note.id}
                                onClick={() => openNote(note)}
                                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                                  isActive
                                    ? 'bg-[rgba(255,86,37,0.12)] text-[#ff5625]'
                                    : 'text-[#c8c2be] hover:bg-[#111111] hover:text-white'
                                }`}
                              >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate">{note.title}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-[#1f1d1d] p-2">
                  <button
                    onClick={() => setShowLeftPanel(false)}
                    className="rounded-lg p-1.5 text-[#666666] transition-colors hover:bg-[rgba(255,86,37,0.1)] hover:text-[#ff5625]"
                    title="Close sidebar"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </Panel>

              <PanelResizeHandle className="w-px bg-[#1f1d1d] transition-colors hover:bg-[#ff5625]" />
            </>
          )}

          <Panel className="relative flex flex-col bg-[#0a0808]">
            {!showLeftPanel && (
              <button
                onClick={() => setShowLeftPanel(true)}
                className="absolute bottom-4 left-4 z-20 rounded-xl border border-[#1f1d1d] bg-[#0a0808] p-2 text-[#666666] shadow-lg transition-colors hover:text-white"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            )}

            {!showRightPanel && (
              <button
                onClick={() => setShowRightPanel(true)}
                className="absolute bottom-4 right-4 z-20 rounded-xl border border-[#1f1d1d] bg-[#0a0808] p-2 text-[#666666] shadow-lg transition-colors hover:text-white"
              >
                <PanelRightOpen className="h-5 w-5" />
              </button>
            )}

            {selectedNote ? (
              <>
                <header className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold text-[#ffb77d]">{selectedNote.title}</h1>
                    </div>

                    <div className="text-right text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#777777]">
                      <div>
                        {editedContent.length} chars · {editedContent.split(/\s+/).filter(Boolean).length} words · Recently opened
                      </div>
                      {isRecording && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#ff5449]/25 bg-[#ff5449]/10 px-3 py-1 text-[0.58rem] text-[#ff8a80]">
                          <Square className="h-3.5 w-3.5 fill-current" />
                          Recording {recordingTime}s
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                <div
                  className="relative flex-1 overflow-hidden"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    const menuWidth = 240
                    const menuHeight = 44 + contextActions.length * 42
                    const padding = 12
                    setContextMenu({
                      x: Math.max(padding, Math.min(event.clientX, window.innerWidth - menuWidth - padding)),
                      y: Math.max(padding, Math.min(event.clientY, window.innerHeight - menuHeight - padding))
                    })
                    editorRef.current?.focus()
                  }}
                >
                  <div className="h-full min-w-0 overflow-hidden">
                    <ObsidianMarkdownEditor
                      ref={editorRef}
                      noteId={selectedNote.id}
                      value={editedContent}
                      noteTitles={linkableNoteTitles}
                      attachmentItems={attachments}
                      onChange={updateNoteContent}
                      onOpenNote={openNoteByTitle}
                      onImportAttachment={importAttachmentFile}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[#666666]">
                <div className="text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-[#ff7043]/60" />
                  <p>Select a note or create a new one.</p>
                </div>
              </div>
            )}
          </Panel>

          {showRightPanel && (
            <>
              <PanelResizeHandle className="w-px bg-[#1f1d1d] transition-colors hover:bg-[#ff5625]" />

              <Panel defaultSize={22} minSize={16} maxSize={34} className="flex flex-col border-l border-[#2a2422] bg-[#0a0808]">
                <div className="flex gap-2 p-4">
                  <button
                    onClick={() => setActiveRightTab('Outline')}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                      activeRightTab === 'Outline'
                        ? 'bg-[rgba(255,86,37,0.1)] text-[#ff5625]'
                        : 'text-[#666666] hover:bg-[#111111] hover:text-white'
                    }`}
                  >
                    Outline
                  </button>
                  <button
                    onClick={() => setActiveRightTab('Graph')}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                      activeRightTab === 'Graph'
                        ? 'bg-[rgba(255,86,37,0.1)] text-[#ff5625]'
                        : 'text-[#666666] hover:bg-[#111111] hover:text-white'
                    }`}
                  >
                    Graph
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {activeRightTab === 'Outline' ? (
                    <div className="space-y-2">
                      <h3 className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-[#ffb77d]">In this note</h3>
                      {headings.length > 0 ? (
                        headings.map((heading, index) => (
                          <div
                            key={`${heading.lineIndex}-${index}`}
                            className="truncate text-sm text-[#c8c2be]"
                            style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
                          >
                            {heading.text}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#555555]">No headings found.</p>
                      )}
                    </div>
                  ) : graph.nodes.length > 0 ? (
                    <div className="relative h-full min-h-[300px]">
                      <GraphView
                        nodes={graph.nodes}
                        edges={graph.edges}
                        onNodeClick={(id) => {
                          const note = notes.find((item) => item.id === id)
                          if (note) {
                            openNote(note)
                          }
                        }}
                      />
                      <button
                        onClick={() => setShowGraphModal(true)}
                        className="absolute right-2 top-2 rounded-lg p-1.5 text-[#666666] transition-colors hover:bg-[rgba(255,86,37,0.1)] hover:text-[#ff5625]"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#666666]">
                      Add linkable notes in `notes/` to build the graph.
                    </div>
                  )}
                </div>

                <div className="border-t border-[#1f1d1d] p-2">
                  <button
                    onClick={() => setShowRightPanel(false)}
                    className="rounded-lg p-1.5 text-[#666666] transition-colors hover:bg-[rgba(255,86,37,0.1)] hover:text-[#ff5625]"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>

        {showCanvas && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="h-[min(88vh,820px)] w-[min(92vw,1120px)] max-w-full">
              <AdvancedCanvas onInsert={insertCanvasPages} onClose={() => setShowCanvas(false)} />
            </div>
          </div>
        )}

        {showGraphModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowGraphModal(false)}
          >
            <div
              className="flex h-[80vh] w-[85vw] flex-col overflow-hidden rounded-2xl border border-[#2a2422] bg-[#0a0808] shadow-[0_0_60px_rgba(255,86,37,0.15)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#2a2422] px-6 py-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#ffb77d]">Graph View</h2>
                <button
                  onClick={() => setShowGraphModal(false)}
                  className="text-lg text-[#666666] transition-colors hover:text-white"
                >
                  X
                </button>
              </div>

              <div className="flex-1">
                <GraphView
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onNodeClick={(id) => {
                    const note = notes.find((item) => item.id === id)
                    if (note) {
                      openNote(note)
                    }
                    setShowGraphModal(false)
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {showCreateFolderModal && (
          <div
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowCreateFolderModal(false)
              setNewFolderName('')
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-[#2a2422] bg-[#0a0808] shadow-[0_0_60px_rgba(255,86,37,0.15)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#2a2422] px-6 py-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#ffb77d]">New Folder</h2>
              </div>

              <div className="px-6 py-5">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newFolderName.trim()) {
                      event.preventDefault()
                      void createFolder(newFolderName)
                    }

                    if (event.key === 'Escape') {
                      setShowCreateFolderModal(false)
                      setNewFolderName('')
                    }
                  }}
                  placeholder="Folder name"
                  className="w-full rounded-xl border border-[#2a2422] bg-[#111111] px-4 py-3 text-sm text-white outline-none placeholder:text-[#555555]"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-[#2a2422] px-6 py-4">
                <button
                  onClick={() => {
                    setShowCreateFolderModal(false)
                    setNewFolderName('')
                  }}
                  className="rounded-xl border border-[#2a2422] px-4 py-2 text-sm text-[#c8c2be] transition-colors hover:bg-[#111111] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void createFolder(newFolderName)}
                  disabled={!newFolderName.trim()}
                  className="rounded-xl bg-[rgba(255,183,125,0.1)] px-4 py-2 text-sm font-medium text-[#ffb77d] transition-colors hover:bg-[rgba(255,183,125,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed z-[260] min-w-[220px] overflow-hidden rounded-xl border border-[#2a2422] bg-[#141212] shadow-[0_14px_40px_rgba(0,0,0,0.45)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#2a2422] px-4 py-2 text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[#8c8079]">
              Editor Actions
            </div>

            <div className="py-1">
              {contextActions.map((item) => (
                <button
                  key={item.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    item.action()
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-[#ddd7d2] transition-colors hover:bg-[rgba(255,86,37,0.12)] hover:text-[#ffb77d]"
                >
                  <span>{item.label}</span>
                  {item.label === 'Attach File' && <Paperclip className="h-4 w-4 text-[#8c8079]" />}
                  {item.label.includes('Record') && <Mic className="h-4 w-4 text-[#8c8079]" />}
                  {item.label === 'Sketch Canvas' && <PenTool className="h-4 w-4 text-[#8c8079]" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
