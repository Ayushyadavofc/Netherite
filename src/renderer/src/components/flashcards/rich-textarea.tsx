import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Mic,
  Paperclip,
  PenTool,
  Square,
  Strikethrough,
  Table2,
  Workflow
} from 'lucide-react'
import { AdvancedCanvas } from '../ui/AdvancedCanvas'
import {
  ObsidianMarkdownEditor,
  type MarkdownEditorHandle
} from '../notes/ObsidianMarkdownEditor'
import {
  buildGeneratedAttachmentName,
  buildImportedAttachmentName,
  detectAttachmentKind,
  detectAttachmentKindFromMime,
  normalizePath,
  resolveAttachmentKind,
  type AttachmentItem
} from '@/lib/attachments'

interface RichTextareaProps {
  value: string
  onChange: (val: string) => void
  label: string
  minHeight?: string
}

interface ToolbarAction {
  title: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
}

function resolveEditorHeight(value: string) {
  if (/^\d+(\.\d+)?$/.test(value)) {
    return `${Math.max(Number(value) * 0.5, 16)}rem`
  }
  return value
}

function collectVaultContext(nodes: any[], vaultPath: string) {
  const titles = new Set<string>()
  const attachments: AttachmentItem[] = []

  const visit = (items: any[]) => {
    for (const item of items) {
      const relativePath = normalizePath(item.path || '')
      if (item.type === 'folder') {
        if (item.children) visit(item.children)
        continue
      }

      if (relativePath.toLowerCase().startsWith('notes/') && relativePath.toLowerCase().endsWith('.md')) {
        titles.add(item.name.replace(/\.md$/i, ''))
      }

      if (relativePath.toLowerCase().startsWith('attachments/')) {
        attachments.push({
          name: item.name,
          fullPath: `${vaultPath}/${relativePath}`,
          relativePath,
          kind: detectAttachmentKind(item.name)
        })
      }
    }
  }

  visit(nodes)

  return {
    noteTitles: Array.from(titles).sort((a, b) => a.localeCompare(b)),
    attachmentItems: attachments.sort((a, b) => a.name.localeCompare(b.name))
  }
}

function ToolbarButton({
  title,
  icon,
  onClick,
  active = false
}: ToolbarAction) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[#a89f99] transition-colors ${
        active
          ? 'border-[#ff5625]/35 bg-[rgba(255,86,37,0.12)] text-[#ffb77d]'
          : 'border-transparent hover:border-[#2a2422] hover:bg-[#171414] hover:text-white'
      }`}
    >
      {icon}
    </button>
  )
}

export function RichTextarea({
  value,
  onChange,
  label,
  minHeight = '100px'
}: RichTextareaProps) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const fieldIdRef = useRef(crypto.randomUUID())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [noteTitles, setNoteTitles] = useState<string[]>([])
  const [attachmentItems, setAttachmentItems] = useState<AttachmentItem[]>([])
  const [showCanvas, setShowCanvas] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const resolvedHeight = useMemo(() => resolveEditorHeight(minHeight), [minHeight])
  const editorHeight = resolvedHeight

  const loadVaultContext = useCallback(async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return
    const nodes = await window.electronAPI.readFolder(vaultPath, { includeMarkdownContent: false })
    const context = collectVaultContext(nodes, vaultPath)
    setNoteTitles(context.noteTitles)
    setAttachmentItems(context.attachmentItems)
  }, [])

  useEffect(() => {
    void loadVaultContext()
  }, [loadVaultContext])

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

  const ensureUniqueAttachmentName = useCallback(async (originalName: string) => {
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
  }, [])

  const registerAttachment = useCallback((name: string, fullPath: string, kind?: AttachmentItem['kind']) => {
    setAttachmentItems((current) => {
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
    async (file: File, source: 'paste' | 'drop' = 'paste') => {
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

  const pickAttachmentFromDisk = useCallback(async () => {
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
  }, [ensureUniqueAttachmentName, registerAttachment])

  const toggleRecording = useCallback(async () => {
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

  const toolbarActions: ToolbarAction[] = [
    {
      title: 'Bold',
      icon: <Bold className="h-4 w-4" />,
      onClick: () => editorRef.current?.wrapSelection('**')
    },
    {
      title: 'Italic',
      icon: <Italic className="h-4 w-4" />,
      onClick: () => editorRef.current?.wrapSelection('*')
    },
    {
      title: 'Strikethrough',
      icon: <Strikethrough className="h-4 w-4" />,
      onClick: () => editorRef.current?.wrapSelection('~~')
    },
    {
      title: 'Bullet List',
      icon: <List className="h-4 w-4" />,
      onClick: () => editorRef.current?.prefixSelectedLines('- ')
    },
    {
      title: 'Numbered List',
      icon: <ListOrdered className="h-4 w-4" />,
      onClick: () => editorRef.current?.prefixSelectedLines('1. ')
    },
    {
      title: 'Table',
      icon: <Table2 className="h-4 w-4" />,
      onClick: () =>
        editorRef.current?.insertSnippet(
          '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n| Value 3 | Value 4 |\n'
        )
    },
    {
      title: 'Flowchart',
      icon: <Workflow className="h-4 w-4" />,
      onClick: () =>
        editorRef.current?.insertSnippet(
          '```mermaid\nflowchart TD\n    A[Start] --> B[Next]\n    B --> C[Done]\n```\n'
        )
    },
    {
      title: 'Attach File',
      icon: <Paperclip className="h-4 w-4" />,
      onClick: () => void pickAttachmentFromDisk()
    },
    {
      title: isRecording ? `Stop Recording (${recordingTime}s)` : 'Record Audio',
      icon: isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />,
      onClick: () => void toggleRecording(),
      active: isRecording
    },
    {
      title: 'Sketch Canvas',
      icon: <PenTool className="h-4 w-4" />,
      onClick: () => setShowCanvas(true),
      active: showCanvas
    }
  ]

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[#2a2422] bg-[#0a0808]">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-[0.55rem] font-bold uppercase tracking-[0.22em] text-[#8c8079]">{label}</span>
            {isRecording && (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#ff5449]/25 bg-[#ff5449]/10 px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#ff8a80]">
                <Square className="h-3.5 w-3.5 fill-current" />
                {recordingTime}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {toolbarActions.map((action) => (
              <ToolbarButton
                key={action.title}
                title={action.title}
                icon={action.icon}
                onClick={action.onClick}
                active={action.active}
              />
            ))}
          </div>
        </div>

        <div className="overflow-hidden" style={{ height: editorHeight }}>
          <ObsidianMarkdownEditor
            ref={editorRef}
            noteId={fieldIdRef.current}
            value={value}
            noteTitles={noteTitles}
            attachmentItems={attachmentItems}
            onChange={onChange}
            onOpenNote={() => {}}
            onImportAttachment={importAttachmentFile}
            placeholderText={`Write ${label.toLowerCase()}...`}
            minHeight={editorHeight}
            compact
            hideScrollbar
          />
        </div>
      </div>

      {showCanvas && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="h-[min(88vh,820px)] w-[min(92vw,1120px)] max-w-full">
            <AdvancedCanvas onInsert={insertCanvasPages} onClose={() => setShowCanvas(false)} />
          </div>
        </div>
      )}
    </>
  )
}
