import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Maximize2,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Plus,
  Search,
  Paperclip,
  Square
} from 'lucide-react'

import { GraphView, type GraphEdge, type GraphNode } from './GraphView'
import { AdvancedCanvas } from '../ui/AdvancedCanvas'
import {
  ObsidianMarkdownEditor,
  type MarkdownEditorHandle
} from './ObsidianMarkdownEditor'
import {
  buildGeneratedAttachmentName,
  buildImportedAttachmentName,
  detectAttachmentKind,
  detectAttachmentKindFromMime,
  normalizePath,
  resolveAttachmentKind,
  type AttachmentItem
} from '@/lib/attachments'
import { Toaster, toast } from 'sonner'

interface Note {
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

interface FolderItem {
  name: string
  expanded: boolean
  noteIds: string[]
}

interface HeadingItem {
  level: number
  text: string
  lineIndex: number
}

const RESERVED_FOLDERS = new Set(['notes', 'flashcards', 'settings', 'attachments'])
const OUTSIDE_JUNK = 'outside junk'

function parseHeadings(content: string): HeadingItem[] {
  return content
    .split('\n')
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)/)
      if (!match) return null
      return {
        level: match[1].length,
        text: match[2],
        lineIndex: index
      }
    })
    .filter((item): item is HeadingItem => item !== null)
}

function parseNoteLinks(content: string): string[] {
  const links: string[] = []
  const regex = /!?\[\[([^\n]*?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match[0].startsWith('![[')) continue
    links.push(match[1].trim())
  }

  return links
}

function getDisplayDate() {
  return new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildGraph(notes: Note[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
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

function slugifyBaseName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Untitled Note'
}

export function Workspace() {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeRightTab, setActiveRightTab] = useState<'Outline' | 'Graph'>('Outline')
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showGraphModal, setShowGraphModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showCanvas, setShowCanvas] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const lastOpenedNoteIdRef = useRef<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  )

  const linkableNotes = useMemo(() => notes.filter((note) => note.linkable), [notes])
  const linkableNoteTitles = useMemo(() => linkableNotes.map((note) => note.title), [linkableNotes])

  const loadVault = useCallback(async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    const fsNodes = await window.electronAPI.readFolder(vaultPath, { includeMarkdownContent: true })
    const loadedNotes: Note[] = []
    const folderMap = new Map<string, string[]>()
    const loadedAttachments: AttachmentItem[] = []

    const pushFolderNote = (folderName: string, noteId: string) => {
      const existing = folderMap.get(folderName) ?? []
      existing.push(noteId)
      folderMap.set(folderName, existing)
    }

    const visit = (nodes: Window['electronAPI'] extends { readFolder: (...args: any[]) => Promise<infer T> } ? T : never) => {
      for (const node of nodes as any[]) {
        const relativePath = normalizePath(node.path)
        if (node.type === 'folder') {
          if (node.children) visit(node.children)
          continue
        }

        const lowerPath = relativePath.toLowerCase()
        if (lowerPath.endsWith('.md')) {
          const noteId = crypto.randomUUID()
          const insideNotes = lowerPath.startsWith('notes/')
          const insideReserved = Array.from(RESERVED_FOLDERS).some(
            (folder) => lowerPath.startsWith(`${folder}/`) || lowerPath === folder
          )

          if (insideNotes) {
            const innerPath = relativePath.slice('notes/'.length)
            const pathParts = innerPath.split('/').filter(Boolean)
            const folderName = pathParts.length > 1 ? pathParts[0] : 'notes'
            loadedNotes.push({
              id: noteId,
              title: node.name.replace(/\.md$/i, ''),
              content: node.content || '',
              folder: folderName,
              path: relativePath,
              fullPath: `${vaultPath}/${relativePath}`,
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
              fullPath: `${vaultPath}/${relativePath}`,
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
            fullPath: `${vaultPath}/${relativePath}`,
            relativePath,
            kind: detectAttachmentKind(node.name)
          })
        }
      }
    }

    visit(fsNodes as any)

    const nextFolders = Array.from(folderMap.entries())
      .map(([name, noteIds]) => ({
        name,
        expanded: name === 'notes' || name === OUTSIDE_JUNK,
        noteIds
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    loadedNotes.sort((a, b) => a.title.localeCompare(b.title))
    loadedAttachments.sort((a, b) => a.name.localeCompare(b.name))

    setNotes(loadedNotes)
    setFolders(nextFolders)
    setAttachments(loadedAttachments)

    const nextSelectedNote = loadedNotes[0] ?? null
    setSelectedNoteId(nextSelectedNote?.id ?? null)
    setEditedContent(nextSelectedNote?.content ?? '')
  }, [])

  useEffect(() => {
    void loadVault()
  }, [loadVault])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
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
      if (interval) clearInterval(interval)
    }
  }, [isRecording])

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const saveNote = useCallback(async (note: Note, content: string) => {
    try {
      await window.electronAPI.writeFile(note.fullPath, content)
      setNotes((currentNotes) =>
        currentNotes.map((item) =>
          item.id === note.id ? { ...item, content, updatedAt: 'Just now' } : item
        )
      )
    } catch (err) {
      toast.error('Save failed — your changes may not have been written to disk.')
      console.error(err)
    }
  }, [])

  const scheduleSave = useCallback(
    (note: Note, content: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void saveNote(note, content)
      }, 500)
    },
    [saveNote]
  )

  const updateNoteContent = useCallback(
    (content: string) => {
      setEditedContent(content)
      if (!selectedNote) return

      scheduleSave(selectedNote, content)
    },
    [scheduleSave, selectedNote]
  )

  const toggleFolder = (folderName: string) => {
    setFolders((current) =>
      current.map((folder) =>
        folder.name === folderName ? { ...folder, expanded: !folder.expanded } : folder
      )
    )
  }

  const openNote = useCallback((note: Note) => {
    setSelectedNoteId(note.id)
    setEditedContent(note.content)

    if (lastOpenedNoteIdRef.current === note.id) return
    lastOpenedNoteIdRef.current = note.id
    const openedAt = getDisplayDate()
    setNotes((current) =>
      current.map((item) => (item.id === note.id ? { ...item, openedAt } : item))
    )
  }, [])

  const createNote = async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    await window.electronAPI.createFolder(`${vaultPath}/notes`)
    const existingTitles = new Set(notes.filter((note) => note.linkable).map((note) => note.title.toLowerCase()))

    let index = 1
    let baseTitle = 'Untitled Note'
    let candidate = baseTitle
    while (existingTitles.has(candidate.toLowerCase())) {
      index += 1
      candidate = `${baseTitle} ${index}`
    }

    const safeTitle = slugifyBaseName(candidate)
    const relativePath = `notes/${safeTitle}.md`
    const fullPath = `${vaultPath}/${relativePath}`
    const content = `# ${safeTitle}\n\n`
    try {
      await window.electronAPI.writeFile(fullPath, content)
    } catch (err) {
      toast.error('Save failed — your changes may not have been written to disk.')
      console.error(err)
      return
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: safeTitle,
      content,
      folder: 'notes',
      path: relativePath,
      fullPath,
      linkable: true,
      updatedAt: 'Just now',
      openedAt: 'Just now'
    }

    setNotes((current) => [newNote, ...current])
    setFolders((current) => {
      const notesFolder = current.find((folder) => folder.name === 'notes')
      if (notesFolder) {
        return current.map((folder) =>
          folder.name === 'notes'
            ? { ...folder, expanded: true, noteIds: [newNote.id, ...folder.noteIds] }
            : folder
        )
      }
      return [{ name: 'notes', expanded: true, noteIds: [newNote.id] }, ...current]
    })
    openNote(newNote)
  }

  const ensureUniqueAttachmentName = useCallback(
    async (originalName: string) => {
      const vaultPath = localStorage.getItem('netherite-current-vault-path')
      if (!vaultPath) return originalName

      const lastDot = originalName.lastIndexOf('.')
      const base = lastDot === -1 ? originalName : originalName.slice(0, lastDot)
      const ext = lastDot === -1 ? '' : originalName.slice(lastDot)

      let candidate = originalName
      let counter = 1
      while (await window.electronAPI.fileExists(`${vaultPath}/attachments/${candidate}`)) {
        candidate = `${base}-${counter}${ext}`
        counter += 1
      }

      return candidate
    },
    []
  )

  const registerAttachment = useCallback((name: string, fullPath: string, kind?: AttachmentItem['kind']) => {
    setAttachments((current) => {
      if (current.some((item) => item.fullPath === fullPath)) return current
      return [
        ...current,
        {
          name,
          fullPath,
          relativePath: `attachments/${name}`,
          kind: resolveAttachmentKind(name, kind)
        }
      ].sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [])

  const importAttachmentFile = useCallback(
    async (file: File, source: 'paste' | 'drop' | 'picker' = 'paste') => {
      const vaultPath = localStorage.getItem('netherite-current-vault-path')
      if (!vaultPath) return null

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

  const pickAttachmentFromDisk = async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    await window.electronAPI.createFolder(`${vaultPath}/attachments`)
    const filePath = await window.electronAPI.selectFile([{ name: 'All Files', extensions: ['*'] }])
    if (!filePath) return

    const originalName = normalizePath(filePath).split('/').pop() || `file-${Date.now()}`
    const finalName = await ensureUniqueAttachmentName(originalName)
    const destination = `${vaultPath}/attachments/${finalName}`
    await window.electronAPI.copyFile(filePath, destination)
    registerAttachment(finalName, destination)
    editorRef.current?.insertWikilink(finalName, true)
  }

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
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const vaultPath = localStorage.getItem('netherite-current-vault-path')
        if (!vaultPath) return

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
      const vaultPath = localStorage.getItem('netherite-current-vault-path')
      if (!vaultPath || pages.length === 0) return

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
      if (note) openNote(note)
    },
    [notes, openNote]
  )

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return notes
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query)
    )
  }, [notes, searchQuery])

  const filteredNoteIds = useMemo(() => new Set(filteredNotes.map((note) => note.id)), [filteredNotes])
  const headings = useMemo(() => parseHeadings(editedContent), [editedContent])
  const graph = useMemo(() => buildGraph(notes), [notes])

  const visibleFolders = useMemo(
    () =>
      folders
        .map((folder) => ({
          ...folder,
          noteIds: folder.noteIds.filter((noteId) => filteredNoteIds.has(noteId))
        }))
        .filter((folder) => folder.noteIds.length > 0 || !searchQuery.trim()),
    [filteredNoteIds, folders, searchQuery]
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

  return (
    <>
      <Toaster richColors theme="dark" />
      <div className="w-full h-full bg-[#0a0808]">
        <PanelGroup direction="horizontal">
        {showLeftPanel && (
          <>
            <Panel defaultSize={22} minSize={16} maxSize={34} className="flex flex-col border-r border-[#2a2422] bg-[#0a0808]">
              <div className="p-4">
                <button
                  onClick={createNote}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[rgba(255,183,125,0.1)] px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#ffb77d] transition-colors hover:bg-[rgba(255,183,125,0.18)]"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Note</span>
                </button>

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
                {visibleFolders.map((folder) => {
                  const folderNotes = folder.noteIds
                    .map((noteId) => filteredNotes.find((note) => note.id === noteId))
                    .filter((note): note is Note => Boolean(note))
                    .sort((a, b) => a.title.localeCompare(b.title))

                  return (
                    <div key={folder.name} className="mb-3">
                      <button
                        onClick={() => toggleFolder(folder.name)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold uppercase tracking-[0.18em] text-[#a8a0a0] transition-colors hover:bg-[#111111] hover:text-white"
                      >
                        {folder.expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Folder className="h-4 w-4" />
                        <span>{folder.name}</span>
                      </button>

                      {folder.expanded && (
                        <div className="mt-1 space-y-1">
                          {folderNotes.map((note) => {
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
                  )
                })}
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
                    <h3 className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-[#ffb77d]">
                      In this note
                    </h3>
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
                        if (note) openNote(note)
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
                    if (note) openNote(note)
                    setShowGraphModal(false)
                  }}
                />
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
