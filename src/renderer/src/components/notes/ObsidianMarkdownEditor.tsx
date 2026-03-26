import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'dompurify'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { autocompletion, startCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import { drawSelection, dropCursor, EditorView, Decoration, type DecorationSet, WidgetType, keymap, placeholder } from '@codemirror/view'
import { indentOnInput, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import mermaid from 'mermaid'
import {
  getAttachmentUrl,
  openAttachmentPreview,
  resolveAttachment,
  type AttachmentItem,
  type ImportedAttachmentSource
} from '@/lib/attachments'

export type { AttachmentKind, AttachmentItem } from '@/lib/attachments'

export interface MarkdownEditorHandle {
  focus: () => void
  wrapSelection: (prefix: string, suffix?: string) => void
  prefixSelectedLines: (prefix: string) => void
  insertSnippet: (snippet: string) => void
  insertWikilink: (name: string, embed?: boolean) => void
}

interface MarkdownEditorProps {
  noteId: string
  value: string
  noteTitles: string[]
  attachmentItems: AttachmentItem[]
  onChange: (value: string) => void
  onOpenNote: (title: string) => void
  onImportAttachment: (file: File, source?: Extract<ImportedAttachmentSource, 'paste' | 'drop'>) => Promise<string | null>
  placeholderText?: string
  minHeight?: string
  compact?: boolean
  hideScrollbar?: boolean
}

interface WikilinkOption {
  label: string
  detail: string
  kind: 'note' | 'file'
}

interface WikilinkMenuState {
  embed: boolean
  from: number
  to: number
  left: number
  top: number
  selectedIndex: number
  options: WikilinkOption[]
}

const refreshDecorationsEffect = StateEffect.define<void>()

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict'
})

function overlapsSelection(from: number, to: number, selectionFrom: number, selectionTo: number) {
  return !(to < selectionFrom || from > selectionTo)
}

class AttachmentWidget extends WidgetType {
  constructor(
    private readonly attachment: AttachmentItem,
    private readonly block: boolean
  ) {
    super()
  }

  eq(other: AttachmentWidget) {
    return other.attachment.fullPath === this.attachment.fullPath && other.block === this.block
  }

  toDOM() {
    const wrapper = document.createElement(this.block ? 'div' : 'span')
    wrapper.className = this.block ? 'cm-attachment-block' : 'cm-attachment-inline'
    wrapper.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openAttachmentPreview(this.attachment)
    })

    if (this.attachment.kind === 'image') {
      const image = document.createElement('img')
      image.src = getAttachmentUrl(this.attachment.fullPath)
      image.alt = this.attachment.name
      image.className = 'cm-attachment-image'
      wrapper.appendChild(image)
      return wrapper
    }

    if (this.attachment.kind === 'video') {
      const video = document.createElement('video')
      video.src = getAttachmentUrl(this.attachment.fullPath)
      video.controls = true
      video.className = 'cm-attachment-video'
      wrapper.appendChild(video)
      return wrapper
    }

    if (this.attachment.kind === 'audio') {
      const audio = document.createElement('audio')
      audio.src = getAttachmentUrl(this.attachment.fullPath)
      audio.controls = true
      audio.className = 'cm-attachment-audio'
      wrapper.appendChild(audio)
      return wrapper
    }

    const chip = document.createElement('span')
    chip.className = 'cm-attachment-chip'
    chip.textContent = this.attachment.name
    wrapper.appendChild(chip)
    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

class MermaidWidget extends WidgetType {
  constructor(private readonly source: string) {
    super()
  }

  eq(other: MermaidWidget) {
    return other.source === this.source
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-mermaid-widget'
    const graph = document.createElement('div')
    graph.className = 'cm-mermaid-graph'
    wrapper.appendChild(graph)

    const renderId = `mermaid-${Math.random().toString(36).slice(2)}`
    void mermaid
      .render(renderId, this.source)
      .then(({ svg }) => {
        graph.innerHTML = DOMPurify.sanitize(svg)
      })
      .catch(() => {
        graph.innerHTML = DOMPurify.sanitize(`<pre>${this.source}</pre>`)
      })

    return wrapper
  }
}

function findTokenAt(doc: string, pos: number) {
  const tokenRegex = /!?\[\[([^\n]*?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(doc)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      return {
        from,
        to,
        raw: match[0],
        name: match[1].trim(),
        embed: match[0].startsWith('![[')
      }
    }
  }

  return null
}

function getActiveWikilinkQuery(textBeforeCursor: string) {
  const linkStart = textBeforeCursor.lastIndexOf('[[')
  if (linkStart === -1) return null

  const embed = linkStart > 0 && textBeforeCursor[linkStart - 1] === '!'
  const openerStart = embed ? linkStart - 1 : linkStart
  const query = textBeforeCursor.slice(linkStart + 2)

  if (query.includes(']]')) return null

  return {
    embed,
    openerStart,
    query
  }
}

function isTokenStandalone(doc: string, from: number, to: number) {
  const lineFrom = doc.lastIndexOf('\n', from - 1) + 1
  const lineTo = doc.indexOf('\n', to)
  const end = lineTo === -1 ? doc.length : lineTo
  return doc.slice(lineFrom, end).trim() === doc.slice(from, to)
}

function buildPreviewDecorations(
  state: EditorState,
  getNoteTitles: () => string[],
  getAttachments: () => AttachmentItem[]
) {
  const tokenDecorations: Range<Decoration>[] = []
  const doc = state.doc.toString()
  const attachmentItems = getAttachments()
  const noteTitleSet = new Set(getNoteTitles().map((title) => title.toLowerCase()))
  const selectionFrom = state.selection.main.from
  const selectionTo = state.selection.main.to

  const tokenRegex = /!?\[\[([^\n]*?)\]\]/g
  let tokenMatch: RegExpExecArray | null

  while ((tokenMatch = tokenRegex.exec(doc)) !== null) {
    const from = tokenMatch.index
    const to = from + tokenMatch[0].length
    if (overlapsSelection(from, to, selectionFrom, selectionTo)) continue

    const embed = tokenMatch[0].startsWith('![[')
    const name = tokenMatch[1].trim()
    if (embed) {
      const attachment = resolveAttachment(attachmentItems, name)
      if (!attachment) continue

      if (isTokenStandalone(doc, from, to)) {
        tokenDecorations.push(
          Decoration.replace({
            widget: new AttachmentWidget(attachment, true),
            block: true
          }).range(from, to)
        )
      } else {
        tokenDecorations.push(Decoration.mark({ class: 'cm-embed-token' }).range(from, to))
      }
    } else {
      tokenDecorations.push(
        Decoration.mark({
          class: noteTitleSet.has(name.toLowerCase()) ? 'cm-note-link-token' : 'cm-broken-link-token'
        }).range(from, to)
      )
    }
  }

  const markdownEmbedRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let markdownEmbedMatch: RegExpExecArray | null
  while ((markdownEmbedMatch = markdownEmbedRegex.exec(doc)) !== null) {
    const from = markdownEmbedMatch.index
    const to = from + markdownEmbedMatch[0].length
    if (overlapsSelection(from, to, selectionFrom, selectionTo)) continue

    const attachment = resolveAttachment(attachmentItems, markdownEmbedMatch[2])
    if (!attachment) continue

    if (isTokenStandalone(doc, from, to)) {
      tokenDecorations.push(
        Decoration.replace({
          widget: new AttachmentWidget(attachment, true),
          block: true
        }).range(from, to)
      )
    } else {
      tokenDecorations.push(Decoration.mark({ class: 'cm-embed-token' }).range(from, to))
    }
  }

  const attachmentLinkRegex = /\[([^\]]+)\]\((attachments\/[^)]+)\)/g
  let attachmentLinkMatch: RegExpExecArray | null
  while ((attachmentLinkMatch = attachmentLinkRegex.exec(doc)) !== null) {
    const from = attachmentLinkMatch.index
    const to = from + attachmentLinkMatch[0].length
    if (overlapsSelection(from, to, selectionFrom, selectionTo)) continue

    const attachment = resolveAttachment(attachmentItems, attachmentLinkMatch[2])
    if (!attachment) continue

    if (isTokenStandalone(doc, from, to)) {
      tokenDecorations.push(
        Decoration.replace({
          widget: new AttachmentWidget(attachment, true),
          block: true
        }).range(from, to)
      )
    } else {
      tokenDecorations.push(Decoration.mark({ class: 'cm-embed-token' }).range(from, to))
    }
  }

  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/g
  let mermaidMatch: RegExpExecArray | null
  while ((mermaidMatch = mermaidRegex.exec(doc)) !== null) {
    const from = mermaidMatch.index
    const to = from + mermaidMatch[0].length
    if (overlapsSelection(from, to, selectionFrom, selectionTo)) continue

    tokenDecorations.push(
      Decoration.replace({
        widget: new MermaidWidget(mermaidMatch[1]),
        block: true
      }).range(from, to)
    )
  }

  return Decoration.set(tokenDecorations, true)
}

function createPreviewDecorationsField(
  getNoteTitles: () => string[],
  getAttachments: () => AttachmentItem[]
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildPreviewDecorations(state, getNoteTitles, getAttachments)
    },
    update(_value, transaction) {
      if (
        transaction.docChanged ||
        !transaction.startState.selection.eq(transaction.state.selection) ||
        transaction.effects.some((effect) => effect.is(refreshDecorationsEffect))
      ) {
        return buildPreviewDecorations(transaction.state, getNoteTitles, getAttachments)
      }
      return buildPreviewDecorations(transaction.state, getNoteTitles, getAttachments)
    },
    provide: (field) => EditorView.decorations.from(field)
  })
}

function createInteractionHandlers(
  onOpenNote: () => (title: string) => void,
  onImportAttachment: () => (file: File, source?: 'paste' | 'drop') => Promise<string | null>
) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false

      const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (position == null) return false

      const token = findTokenAt(view.state.doc.toString(), position)
      if (!token || token.embed) return false

      event.preventDefault()
      onOpenNote()(token.name)
      return true
    },
    paste(event, view) {
      const file = Array.from(event.clipboardData?.files ?? [])[0]
      if (!file) return false

      event.preventDefault()
      void onImportAttachment()(file, 'paste').then((name) => {
        if (!name) return
        insertText(view, buildInsertedWikilink(view, name, true))
      })
      return true
    },
    drop(event, view) {
      const file = Array.from(event.dataTransfer?.files ?? [])[0]
      if (!file) return false

      event.preventDefault()
      void onImportAttachment()(file, 'drop').then((name) => {
        if (!name) return
        insertText(view, buildInsertedWikilink(view, name, true))
      })
      return true
    }
  })
}

function insertText(view: EditorView, text: string) {
  const selection = view.state.selection.main
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: { anchor: selection.from + text.length },
    scrollIntoView: true
  })
  view.focus()
}

function buildInsertedWikilink(view: EditorView, name: string, embed: boolean) {
  const token = `${embed ? '!' : ''}[[${name}]]`
  if (!embed) return token

  const selection = view.state.selection.main
  const line = view.state.doc.lineAt(selection.from)
  const before = view.state.sliceDoc(line.from, selection.from)
  const after = view.state.sliceDoc(selection.to, line.to)
  const prefix = before.trim().length > 0 ? '\n' : ''
  const suffix = after.trim().length > 0 ? '\n' : '\n'

  return `${prefix}${token}${suffix}`
}

function buildCompletionSource(
  getNoteTitles: () => string[],
  getAttachments: () => AttachmentItem[]
) {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBeforeCursor = context.state.sliceDoc(line.from, context.pos)
    const activeQuery = getActiveWikilinkQuery(textBeforeCursor)
    if (!activeQuery) return null
    if (!context.explicit && activeQuery.query.length === 0 && !textBeforeCursor.endsWith('[[')) return null

    const embed = activeQuery.embed
    const query = activeQuery.query.toLowerCase()
    const source = embed ? getAttachments().map((item) => item.name) : getNoteTitles()
    const options: Completion[] = source
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 20)
      .map((name) => ({
        label: name,
        type: embed ? 'file' : 'text',
        apply(view, completion, from, to) {
          const token = buildInsertedWikilink(view, String(completion.label), embed)
          view.dispatch({
            changes: { from, to, insert: token },
            selection: { anchor: from + token.length },
            scrollIntoView: true
          })
          view.focus()
        }
      }))

    return {
      from: line.from + activeQuery.openerStart,
      options,
      validFor: /^[^\n]*$/
    }
  }
}

export const ObsidianMarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function ObsidianMarkdownEditor(
    {
      noteId,
      value,
      noteTitles,
      attachmentItems,
      onChange,
      onOpenNote,
      onImportAttachment,
      placeholderText = 'Start writing in markdown...',
      minHeight = '100%',
      compact = false,
      hideScrollbar = false
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const activeNoteIdRef = useRef(noteId)
    const noteTitlesRef = useRef(noteTitles)
    const attachmentItemsRef = useRef(attachmentItems)
    const onChangeRef = useRef(onChange)
    const onOpenNoteRef = useRef(onOpenNote)
    const onImportAttachmentRef = useRef(onImportAttachment)
    const wikilinkMenuRef = useRef<WikilinkMenuState | null>(null)
    const wikilinkMenuNodeRef = useRef<HTMLDivElement | null>(null)
    const [wikilinkMenu, setWikilinkMenu] = useState<WikilinkMenuState | null>(null)

    noteTitlesRef.current = noteTitles
    attachmentItemsRef.current = attachmentItems
    onChangeRef.current = onChange
    onOpenNoteRef.current = onOpenNote
    onImportAttachmentRef.current = onImportAttachment
    wikilinkMenuRef.current = wikilinkMenu

    const syncWikilinkMenu = useCallback((view: EditorView) => {
      const selection = view.state.selection.main
      if (!selection.empty) {
        setWikilinkMenu(null)
        return
      }

      const line = view.state.doc.lineAt(selection.head)
      const textBeforeCursor = view.state.sliceDoc(line.from, selection.head)
      const activeQuery = getActiveWikilinkQuery(textBeforeCursor)
      if (!activeQuery) {
        setWikilinkMenu(null)
        return
      }

      const embed = activeQuery.embed
      const query = activeQuery.query.toLowerCase()
      const candidates: WikilinkOption[] = embed
        ? attachmentItemsRef.current.map((item) => ({
            label: item.name,
            detail:
              item.kind === 'image'
                ? 'Image'
                : item.kind === 'video'
                  ? 'Video'
                  : item.kind === 'audio'
                    ? 'Audio'
                    : 'Attachment',
            kind: 'file'
          }))
        : noteTitlesRef.current.map((title) => ({
            label: title,
            detail: 'Note',
            kind: 'note'
          }))

      const scored = candidates
        .filter((item) => item.label.toLowerCase().includes(query))
        .sort((left, right) => {
          const leftLabel = left.label.toLowerCase()
          const rightLabel = right.label.toLowerCase()
          const leftStarts = leftLabel.startsWith(query) ? 0 : 1
          const rightStarts = rightLabel.startsWith(query) ? 0 : 1
          if (leftStarts !== rightStarts) return leftStarts - rightStarts
          return leftLabel.localeCompare(rightLabel)
        })
        .slice(0, 12)

      if (scored.length === 0) {
        setWikilinkMenu(null)
        return
      }

      const coords = view.coordsAtPos(selection.head)
      if (!coords) {
        setWikilinkMenu(null)
        return
      }

      const menuWidth = 340
      const left = Math.max(12, Math.min(coords.left, window.innerWidth - menuWidth - 12))
      const top = Math.min(coords.bottom + 8, window.innerHeight - 220)
      const from = line.from + activeQuery.openerStart
      const to = selection.head

      setWikilinkMenu((current) => ({
        embed,
        from,
        to,
        left,
        top,
        options: scored,
        selectedIndex:
          current && current.from === from && current.embed === embed
            ? Math.min(current.selectedIndex, scored.length - 1)
            : 0
      }))
    }, [])

    const applyWikilinkOption = useCallback((index?: number) => {
      const view = viewRef.current
      const menu = wikilinkMenuRef.current
      if (!view || !menu || menu.options.length === 0) return false

      const option = menu.options[index ?? menu.selectedIndex]
      const token = buildInsertedWikilink(view, option.label, menu.embed)
      view.dispatch({
        changes: { from: menu.from, to: menu.to, insert: token },
        selection: { anchor: menu.from + token.length },
        scrollIntoView: true
      })
      view.focus()
      setWikilinkMenu(null)
      return true
    }, [])

    const wikilinkInteractionHandlers = useMemo(
      () =>
        EditorView.domEventHandlers({
          keydown(event) {
            const menu = wikilinkMenuRef.current
            if (!menu) return false

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setWikilinkMenu((current) =>
                current
                  ? { ...current, selectedIndex: Math.min(current.selectedIndex + 1, current.options.length - 1) }
                  : current
              )
              return true
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setWikilinkMenu((current) =>
                current ? { ...current, selectedIndex: Math.max(current.selectedIndex - 1, 0) } : current
              )
              return true
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              return applyWikilinkOption()
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setWikilinkMenu(null)
              return true
            }

            return false
          }
        }),
      [applyWikilinkOption]
    )

    const previewDecorationsField = useMemo(
      () =>
        createPreviewDecorationsField(
          () => noteTitlesRef.current,
          () => attachmentItemsRef.current
        ),
      []
    )
    const interactionHandlers = useMemo(
      () =>
        createInteractionHandlers(
          () => onOpenNoteRef.current,
          () => onImportAttachmentRef.current
        ),
      []
    )

    const completionSource = useMemo(
      () => buildCompletionSource(() => noteTitlesRef.current, () => attachmentItemsRef.current),
      []
    )

    useEffect(() => {
      if (!hostRef.current) return

      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab
          ]),
          markdown(),
          placeholder(placeholderText),
          autocompletion({ override: [completionSource] }),
          previewDecorationsField,
          interactionHandlers,
          wikilinkInteractionHandlers,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextValue = update.state.doc.toString()
              onChangeRef.current(nextValue)

              const selection = update.state.selection.main
              if (selection.empty) {
                const textBeforeCursor = nextValue.slice(Math.max(0, selection.head - 120), selection.head)
                if (getActiveWikilinkQuery(textBeforeCursor)) {
                  window.requestAnimationFrame(() => startCompletion(update.view))
                }
              }
            }

            if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
              syncWikilinkMenu(update.view)
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: '#0a0808',
              color: '#e0dcd8',
              fontSize: '14px'
            },
            '.cm-scroller': {
              overflow: 'auto',
              height: '100%',
              fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
              scrollbarWidth: hideScrollbar ? 'none' : 'auto'
            },
            '.cm-content': {
              minHeight,
              padding: compact ? '14px 18px 24px' : '48px 56px 96px',
              maxWidth: compact ? '100%' : '860px',
              margin: compact ? '0' : '0 auto',
              lineHeight: '1.7'
            },
            '.cm-focused': {
              outline: 'none'
            },
            '.cm-cursor': {
              borderLeftColor: '#ffb77d'
            },
            '.cm-activeLine': {
              backgroundColor: 'rgba(255, 183, 125, 0.03)'
            },
            '.cm-selectionBackground, ::selection': {
              backgroundColor: 'rgba(255, 86, 37, 0.25) !important'
            },
            '.cm-gutters': {
              backgroundColor: '#0a0808',
              border: 'none',
              color: '#666666',
              display: 'none'
            },
            '.cm-foldPlaceholder': {
              backgroundColor: '#141212',
              border: '1px solid #2a2422',
              color: '#ffb77d'
            },
            '.cm-note-link-token': {
              color: '#ffb77d',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(255, 183, 125, 0.45)',
              textUnderlineOffset: '4px'
            },
            '.cm-broken-link-token': {
              color: '#e0dcd8'
            },
            '.cm-embed-token': {
              color: '#ffb77d'
            },
            '.cm-attachment-inline': {
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: '320px',
              verticalAlign: 'middle'
            },
            '.cm-attachment-block': {
              display: 'block',
              margin: '8px 0 16px'
            },
            '.cm-attachment-image': {
              maxWidth: '100%',
              maxHeight: '320px',
              borderRadius: '12px',
              border: '1px solid #2a2422'
            },
            '.cm-attachment-video': {
              display: 'block',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '420px',
              borderRadius: '12px',
              backgroundColor: '#000000'
            },
            '.cm-attachment-audio': {
              display: 'block',
              width: '100%',
              maxWidth: '520px'
            },
            '.cm-attachment-chip': {
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '999px',
              backgroundColor: '#141212',
              border: '1px solid #2a2422',
              color: '#ffb77d'
            },
            '.cm-mermaid-widget': {
              margin: '16px 0',
              padding: '16px',
              borderRadius: '14px',
              border: '1px solid #2a2422',
              backgroundColor: '#111111'
            },
            '.cm-mermaid-graph': {
              overflow: 'auto'
            },
            '.cm-tooltip-autocomplete': {
              backgroundColor: '#141212',
              border: '1px solid #2a2422',
              color: '#e0dcd8'
            },
            '.cm-tooltip-autocomplete ul li[aria-selected]': {
              backgroundColor: 'rgba(255, 86, 37, 0.12)',
              color: '#ff5625'
            },
            '.cm-scroller::-webkit-scrollbar': {
              display: hideScrollbar ? 'none' : 'block'
            },
            '.ͼ1 .cm-formatting': {
              color: '#5d514c'
            },
            '.cm-line': {
              padding: '0 2px'
            }
          })
        ]
      })

      const view = new EditorView({
        state,
        parent: hostRef.current
      })

      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [compact, completionSource, hideScrollbar, interactionHandlers, minHeight, placeholderText, previewDecorationsField, syncWikilinkMenu, wikilinkInteractionHandlers])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const noteChanged = activeNoteIdRef.current !== noteId
      if (!noteChanged && view.state.doc.toString() === value) return
      activeNoteIdRef.current = noteId

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value
        },
        selection: { anchor: 0 },
        scrollIntoView: true
      })
    }, [noteId, value])

    useEffect(() => {
      viewRef.current?.dispatch({ effects: refreshDecorationsEffect.of(undefined) })
    }, [attachmentItems, noteTitles])

    useEffect(() => {
      if (!wikilinkMenu) return

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node
        if (wikilinkMenuNodeRef.current?.contains(target)) return
        if (hostRef.current?.contains(target)) return
        setWikilinkMenu(null)
      }

      window.addEventListener('mousedown', handlePointerDown)
      return () => window.removeEventListener('mousedown', handlePointerDown)
    }, [wikilinkMenu])

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          viewRef.current?.focus()
        },
        wrapSelection(prefix: string, suffix = prefix) {
          const view = viewRef.current
          if (!view) return
          const selection = view.state.selection.main
          const selected = view.state.sliceDoc(selection.from, selection.to)
          const insert = `${prefix}${selected}${suffix}`
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert },
            selection: {
              anchor: selection.from + prefix.length,
              head: selection.from + prefix.length + selected.length
            },
            scrollIntoView: true
          })
          view.focus()
        },
        prefixSelectedLines(prefix: string) {
          const view = viewRef.current
          if (!view) return
          const selection = view.state.selection.main
          const startLine = view.state.doc.lineAt(selection.from)
          const endLine = view.state.doc.lineAt(selection.to)
          const changes = []

          for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
            const line = view.state.doc.line(lineNumber)
            changes.push({ from: line.from, insert: prefix })
          }

          view.dispatch({ changes, scrollIntoView: true })
          view.focus()
        },
        insertSnippet(snippet: string) {
          const view = viewRef.current
          if (!view) return
          insertText(view, snippet)
        },
        insertWikilink(name: string, embed = false) {
          const view = viewRef.current
          if (!view) return
          insertText(view, buildInsertedWikilink(view, name, embed))
        }
      }),
      []
    )

    return (
      <>
        <div ref={hostRef} className="h-full w-full" />
        {wikilinkMenu &&
          createPortal(
            <div
              ref={wikilinkMenuNodeRef}
              className="fixed z-[400] w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-[#2a2422] bg-[#141212] shadow-[0_18px_48px_rgba(0,0,0,0.5)]"
              style={{ left: wikilinkMenu.left, top: wikilinkMenu.top }}
            >
              <div className="max-h-[280px] overflow-y-auto py-1">
                {wikilinkMenu.options.map((option, index) => (
                  <button
                    key={`${option.kind}-${option.label}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      void applyWikilinkOption(index)
                    }}
                    className={`flex w-full flex-col px-4 py-3 text-left transition-colors ${
                      index === wikilinkMenu.selectedIndex
                        ? 'bg-[rgba(255,86,37,0.14)]'
                        : 'hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                  >
                    <span className="text-base text-[#f3eee9]">{option.label}</span>
                    <span className="text-xs text-[#8c8079]">{option.detail}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-[#2a2422] px-3 py-2 text-[0.68rem] text-[#8c8079]">
                {wikilinkMenu.embed ? 'Type to link files' : 'Type to link notes'}
              </div>
            </div>,
            document.body
          )}
      </>
    )
  }
)
