import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  X
} from 'lucide-react'

import { useProfile } from '@/hooks/use-data'
import { generateFlashcards } from '@/lib/gemini'
import type { Deck, Card } from '@/pages/FlashcardsPage'
import { defaultDeckSettings } from '@/pages/FlashcardsPage'

type ExplorerNode = {
  name: string
  type: 'file' | 'folder'
  path: string
  children?: ExplorerNode[]
}

type NoteEntry = {
  name: string
  path: string
}

type NoteContent = {
  name: string
  content: string
}

type GenerationPhase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'generating'; current: number; total: number }
  | { kind: 'saving' }
  | { kind: 'done'; count: number; deckName: string }
  | { kind: 'error'; message: string }

interface GenerateFlashcardsModalProps {
  isOpen: boolean
  onClose: () => void
  decks: Deck[]
  onDecksChanged: () => void | Promise<void>
}

const FLASHCARD_CHUNK_WORD_LIMIT = 300
const FLASHCARD_CHUNK_CARD_LIMIT = 9

const isAbsolutePathLike = (value: string) =>
  /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('/')

function countWords(content: string): number {
  const trimmed = content.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function targetCardsForWordCount(wordCount: number): number {
  return Math.max(3, Math.ceil(wordCount / 100))
}

function chunkNotesByWordCount(
  notes: NoteContent[],
  maxWords = FLASHCARD_CHUNK_WORD_LIMIT,
  maxCards = FLASHCARD_CHUNK_CARD_LIMIT
): NoteContent[][] {
  const chunks: NoteContent[][] = []
  let currentChunk: NoteContent[] = []
  let currentWordCount = 0
  let currentCardCount = 0

  for (const note of notes) {
    const noteWordCount = countWords(note.content)
    const noteCardCount = targetCardsForWordCount(noteWordCount)

    if (
      currentChunk.length > 0 &&
      (currentWordCount + noteWordCount > maxWords ||
        currentCardCount + noteCardCount > maxCards)
    ) {
      chunks.push(currentChunk)
      currentChunk = []
      currentWordCount = 0
      currentCardCount = 0
    }

    currentChunk.push(note)
    currentWordCount += noteWordCount
    currentCardCount += noteCardCount
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function filterNoteTree(nodes: ExplorerNode[]): ExplorerNode[] {
  return nodes
    .map((node) => {
      if (node.type === 'folder') {
        const children = filterNoteTree(node.children ?? [])
        if (children.length === 0) {
          return null
        }

        return {
          ...node,
          children
        }
      }

      if (!node.name.toLowerCase().endsWith('.md') || node.name.startsWith('.')) {
        return null
      }

      return node
    })
    .filter((node): node is ExplorerNode => node !== null)
}

function collectNotesFromNodes(nodes: ExplorerNode[]): NoteEntry[] {
  const entries: NoteEntry[] = []

  for (const node of nodes) {
    if (node.type === 'folder') {
      entries.push(...collectNotesFromNodes(node.children ?? []))
      continue
    }

    entries.push({
      name: node.path.replace(/\.md$/i, ''),
      path: node.path
    })
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

function findFolderNode(nodes: ExplorerNode[], folderPath: string): ExplorerNode | null {
  for (const node of nodes) {
    if (node.type !== 'folder') {
      continue
    }

    if (node.path === folderPath) {
      return node
    }

    const nested = findFolderNode(node.children ?? [], folderPath)
    if (nested) {
      return nested
    }
  }

  return null
}

function collectNotesFromNode(node: ExplorerNode): NoteEntry[] {
  if (node.type === 'file') {
    return [
      {
        name: node.path.replace(/\.md$/i, ''),
        path: node.path
      }
    ]
  }

  return collectNotesFromNodes(node.children ?? [])
}

function getEntryLabel(node: ExplorerNode) {
  return node.type === 'file' ? node.name.replace(/\.md$/i, '') : node.name
}

function buildBreadcrumbs(folderPath: string) {
  const parts = folderPath.split('/').filter(Boolean)
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join('/')
  }))
}

export function GenerateFlashcardsModal({
  isOpen,
  onClose,
  decks,
  onDecksChanged
}: GenerateFlashcardsModalProps) {
  const [storedProfile] = useProfile()
  const apiKey = storedProfile.geminiApiKey?.trim() ?? ''

  const [noteTree, setNoteTree] = useState<ExplorerNode[]>([])
  const [selectedNotePaths, setSelectedNotePaths] = useState<Set<string>>(new Set())
  const [currentFolderPath, setCurrentFolderPath] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [targetDeckId, setTargetDeckId] = useState<string | '__new__'>('')
  const [newDeckName, setNewDeckName] = useState('')
  const [phase, setPhase] = useState<GenerationPhase>({ kind: 'idle' })

  const vaultPath = useMemo(
    () => localStorage.getItem('netherite-current-vault-path'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen]
  )

  const notesRootPath = useMemo(() => {
    if (!vaultPath) {
      return null
    }

    return `${vaultPath}/notes`
  }, [vaultPath])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setNoteTree([])
    setSelectedNotePaths(new Set())
    setCurrentFolderPath('')
    setSearchQuery('')
    setTargetDeckId(decks[0]?.id ?? '__new__')
    setNewDeckName('')
    setPhase({ kind: 'idle' })
  }, [isOpen, decks])

  useEffect(() => {
    if (!isOpen || !notesRootPath) {
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const nodes = await window.electronAPI.readFolder(notesRootPath, {
          includeMarkdownContent: false
        })

        if (!cancelled) {
          setNoteTree(filterNoteTree(nodes))
        }
      } catch (error) {
        console.error('Failed to load notes explorer for flashcards:', error)
        if (!cancelled) {
          setNoteTree([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, notesRootPath])

  const allNotes = useMemo(() => collectNotesFromNodes(noteTree), [noteTree])

  const notesByPath = useMemo(
    () => new Map(allNotes.map((note) => [note.path, note] as const)),
    [allNotes]
  )

  const currentFolderEntries = useMemo(() => {
    if (!currentFolderPath) {
      return noteTree
    }

    return findFolderNode(noteTree, currentFolderPath)?.children ?? []
  }, [currentFolderPath, noteTree])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return currentFolderEntries
    }

    return currentFolderEntries.filter((node) => getEntryLabel(node).toLowerCase().includes(query))
  }, [currentFolderEntries, searchQuery])

  const selectedNotes = useMemo(
    () =>
      Array.from(selectedNotePaths)
        .map((path) => notesByPath.get(path))
        .filter((note): note is NoteEntry => Boolean(note)),
    [notesByPath, selectedNotePaths]
  )

  const selectedNoteCount = selectedNotePaths.size
  const estimatedCards = selectedNoteCount * 3
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentFolderPath), [currentFolderPath])

  const canGenerate =
    apiKey.length > 0 &&
    selectedNoteCount > 0 &&
    (targetDeckId !== '__new__' || newDeckName.trim().length > 0) &&
    phase.kind === 'idle'

  const setNotesSelected = useCallback((notePaths: string[], shouldSelect: boolean) => {
    if (notePaths.length === 0) {
      return
    }

    setSelectedNotePaths((previous) => {
      const next = new Set(previous)
      for (const notePath of notePaths) {
        if (shouldSelect) {
          next.add(notePath)
        } else {
          next.delete(notePath)
        }
      }
      return next
    })
  }, [])

  const getNodeNotePaths = useCallback((node: ExplorerNode) => {
    return collectNotesFromNode(node).map((note) => note.path)
  }, [])

  const getNodeSelectionState = useCallback(
    (node: ExplorerNode) => {
      const notePaths = getNodeNotePaths(node)
      const selectedCount = notePaths.filter((notePath) => selectedNotePaths.has(notePath)).length

      return {
        selectedCount,
        totalCount: notePaths.length,
        checked: notePaths.length > 0 && selectedCount === notePaths.length,
        partial: selectedCount > 0 && selectedCount < notePaths.length
      }
    },
    [getNodeNotePaths, selectedNotePaths]
  )

  const handleSelectAllVisible = useCallback(() => {
    const visibleNotePaths = filteredEntries.flatMap((node) => getNodeNotePaths(node))
    setNotesSelected(visibleNotePaths, true)
  }, [filteredEntries, getNodeNotePaths, setNotesSelected])

  const handleClearVisible = useCallback(() => {
    const visibleNotePaths = filteredEntries.flatMap((node) => getNodeNotePaths(node))
    setNotesSelected(visibleNotePaths, false)
  }, [filteredEntries, getNodeNotePaths, setNotesSelected])

  const handleToggleNode = useCallback(
    (node: ExplorerNode) => {
      const notePaths = getNodeNotePaths(node)
      const shouldSelect = notePaths.some((notePath) => !selectedNotePaths.has(notePath))
      setNotesSelected(notePaths, shouldSelect)
    },
    [getNodeNotePaths, selectedNotePaths, setNotesSelected]
  )

  const handleGenerate = async () => {
    if (!notesRootPath || !canGenerate) {
      return
    }

    try {
      setPhase({ kind: 'reading' })

      const noteContents: NoteContent[] = []
      for (const note of selectedNotes) {
        try {
          const content = await window.electronAPI.readFile(`${notesRootPath}/${note.path}`)
          if (content.trim()) {
            noteContents.push({
              name: note.name,
              content
            })
          }
        } catch {
          // Skip unreadable notes.
        }
      }

      if (noteContents.length === 0) {
        setPhase({
          kind: 'error',
          message: 'All selected notes were empty or unreadable.'
        })
        return
      }

      const noteChunks = chunkNotesByWordCount(noteContents)
      const allGeneratedCards: { front: string; back: string }[] = []

      for (let index = 0; index < noteChunks.length; index += 1) {
        setPhase({
          kind: 'generating',
          current: index + 1,
          total: noteChunks.length
        })

        const chunkCards = await generateFlashcards(noteChunks[index], apiKey)
        allGeneratedCards.push(...chunkCards)
      }

      if (allGeneratedCards.length === 0) {
        setPhase({
          kind: 'error',
          message:
            'Netherite could not generate any flashcards from the selected notes. Check that the notes have meaningful content.'
        })
        return
      }

      setPhase({ kind: 'saving' })

      let targetDeck: Deck
      let isNewDeck = false

      if (targetDeckId === '__new__') {
        const safeName = newDeckName.replace(/[/\\]/g, '').replace(/\.\./g, '').trim()
        if (!safeName) {
          setPhase({ kind: 'error', message: 'Invalid deck name.' })
          return
        }

        const fileName = `${safeName}.md`
        targetDeck = {
          id: fileName,
          name: safeName,
          fileName,
          cards: [],
          total: 0,
          dueToday: 0,
          newCards: 0,
          lastStudied: 'Never',
          isOverdue: false,
          settings: { ...defaultDeckSettings }
        }
        isNewDeck = true
      } else {
        const existing = decks.find((deck) => deck.id === targetDeckId)
        if (!existing) {
          setPhase({ kind: 'error', message: 'Selected deck not found.' })
          return
        }

        targetDeck = {
          ...existing,
          cards: [...existing.cards]
        }
      }

      const sm2Cards: Card[] = allGeneratedCards.map((rawCard) => ({
        id: crypto.randomUUID(),
        question: rawCard.front,
        answer: rawCard.back,
        sm2: {
          reps: 0,
          interval: 0,
          ease: targetDeck.settings.startingEase,
          nextReview: 0,
          state: 'new' as const,
          step: 0,
          lapses: 0
        }
      }))

      targetDeck.cards.push(...sm2Cards)
      targetDeck.total = targetDeck.cards.length
      targetDeck.newCards = targetDeck.cards.filter((card) => card.sm2.reps === 0).length
      targetDeck.dueToday = targetDeck.cards.filter(
        (card) => card.sm2.reps > 0 && card.sm2.nextReview <= Date.now()
      ).length

      if (!vaultPath) {
        setPhase({ kind: 'error', message: 'Vault path not found.' })
        return
      }

      const fullPath = isAbsolutePathLike(targetDeck.fileName)
        ? targetDeck.fileName
        : `${vaultPath}/flashcards/${targetDeck.fileName}`

      let content = `# ${targetDeck.name}\n`
      content += `<!-- AnkiSettings: ${JSON.stringify(targetDeck.settings)} -->\n\n`
      for (const card of targetDeck.cards) {
        content += `---\n`
        content += `Q: ${card.question}\n`
        content += `A: ${card.answer}\n`
        content += `<!-- SM2: ${JSON.stringify(card.sm2)} -->\n\n`
      }

      try {
        await window.electronAPI.createFolder(`${vaultPath}/flashcards`)
      } catch {
        // Folder already exists.
      }

      await window.electronAPI.writeFile(fullPath, content)

      setPhase({
        kind: 'done',
        count: sm2Cards.length,
        deckName: targetDeck.name
      })

      if (isNewDeck) {
        setTargetDeckId(targetDeck.id)
      }

      await onDecksChanged()
    } catch (error) {
      console.error('Flashcard generation failed. Full error object:', error)

      let displayMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred.'

      if (displayMessage.includes('429')) {
        displayMessage = displayMessage.includes('Groq API error:')
          ? `${displayMessage} Try again after the quota window resets.`
          : 'Groq hit a rate limit or quota cap. Please wait about 60 seconds and try again.'
      }

      setPhase({
        kind: 'error',
        message: displayMessage
      })
    }
  }

  const handleClose = () => {
    if (phase.kind === 'reading' || phase.kind === 'generating' || phase.kind === 'saving') {
      return
    }

    onClose()
  }

  if (!isOpen) {
    return null
  }

  const isGenerating =
    phase.kind === 'reading' || phase.kind === 'generating' || phase.kind === 'saving'

  const emptyStateMessage = noteTree.length === 0
    ? 'No notes found in this vault.'
    : searchQuery.trim()
      ? 'No items match your search in this folder.'
      : 'This folder is empty.'

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[var(--nv-primary)]" />
            <h3 className="text-xl font-bold text-white">Generate Flashcards</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isGenerating}
            className="rounded-full p-1 text-[var(--nv-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!apiKey && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--nv-danger)] bg-[var(--nv-danger-soft)] px-4 py-3 text-sm text-[var(--nv-foreground)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Add your Groq API key in <span className="font-semibold text-white">Settings</span> for AI generation.
              </span>
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-subtle)]">
                Select Notes <span className="text-[var(--nv-muted)]">({selectedNoteCount} selected)</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  disabled={isGenerating || filteredEntries.length === 0}
                  className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--nv-primary)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Select All
                </button>
                <span className="text-[var(--nv-border)]">-</span>
                <button
                  type="button"
                  onClick={handleClearVisible}
                  disabled={isGenerating || filteredEntries.length === 0}
                  className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--nv-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mb-2 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--nv-muted)]">
                <button
                  type="button"
                  onClick={() => setCurrentFolderPath('')}
                  disabled={isGenerating}
                  className={`rounded-md px-2 py-1 transition-colors ${
                    currentFolderPath === ''
                      ? 'bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]'
                      : 'hover:bg-[var(--nv-surface)] hover:text-white'
                  }`}
                >
                  notes
                </button>
                {breadcrumbs.map((crumb) => (
                  <div key={crumb.path} className="flex items-center gap-2">
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--nv-subtle)]" />
                    <button
                      type="button"
                      onClick={() => setCurrentFolderPath(crumb.path)}
                      disabled={isGenerating}
                      className={`rounded-md px-2 py-1 transition-colors ${
                        currentFolderPath === crumb.path
                          ? 'bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]'
                          : 'hover:bg-[var(--nv-surface)] hover:text-white'
                      }`}
                    >
                      {crumb.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-subtle)]" />
              <input
                type="text"
                placeholder="Search this folder..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={isGenerating}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--nv-subtle)] outline-none transition-colors focus:border-[var(--nv-primary)]"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)]">
              {filteredEntries.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm italic text-[var(--nv-subtle)]">{emptyStateMessage}</p>
              ) : (
                filteredEntries.map((node) => {
                  const selectionState = getNodeSelectionState(node)
                  const rowLabel = getEntryLabel(node)
                  const nestedNoteCount = selectionState.totalCount

                  return (
                    <div
                      key={node.path}
                      className="flex items-center gap-3 border-b border-[var(--nv-border)] px-4 py-2.5 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleNode(node)}
                        disabled={isGenerating}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          selectionState.checked || selectionState.partial
                            ? 'border-[var(--nv-primary)] bg-[var(--nv-primary)] text-[var(--nv-bg)]'
                            : 'border-[var(--nv-subtle)] text-transparent'
                        }`}
                        aria-label={`Select ${rowLabel}`}
                      >
                        {selectionState.partial ? (
                          <span className="text-[10px] font-black leading-none">-</span>
                        ) : selectionState.checked ? (
                          <svg viewBox="0 0 12 12" className="h-3 w-3">
                            <path
                              d="M3 6l2 2 4-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </button>

                      {node.type === 'folder' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentFolderPath(node.path)
                            setSearchQuery('')
                          }}
                          disabled={isGenerating}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors hover:text-white disabled:cursor-not-allowed"
                        >
                          <div className="flex min-w-0 items-center gap-3 text-[var(--nv-muted)]">
                            <Folder className="h-4 w-4 shrink-0 text-[var(--nv-secondary)]" />
                            <span className="truncate">{rowLabel}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[var(--nv-subtle)]">
                            <span>{nestedNoteCount} note{nestedNoteCount === 1 ? '' : 's'}</span>
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleNode(node)}
                          disabled={isGenerating}
                          className={`flex min-w-0 flex-1 items-center gap-3 text-left transition-colors disabled:cursor-not-allowed ${
                            selectionState.checked ? 'text-white' : 'text-[var(--nv-muted)] hover:text-white'
                          }`}
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[var(--nv-subtle)]" />
                          <span className="truncate">{rowLabel}</span>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <p className="mt-2 text-xs text-[var(--nv-subtle)]">
              Open folders to choose individual notes, or tick a folder to include every note inside it.
            </p>
          </section>

          <section>
            <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-subtle)]">Target Deck</p>
            <div className="relative">
              <select
                value={targetDeckId}
                onChange={(event) => setTargetDeckId(event.target.value as string)}
                disabled={isGenerating}
                className="w-full appearance-none rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3 pr-10 text-sm text-white outline-none transition-colors focus:border-[var(--nv-primary)]"
              >
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
                <option value="__new__">+ Create new deck</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-subtle)]" />
            </div>

            {targetDeckId === '__new__' && (
              <div className="mt-3 flex items-center gap-2">
                <Plus className="h-4 w-4 shrink-0 text-[var(--nv-subtle)]" />
                <input
                  type="text"
                  placeholder="New deck name..."
                  value={newDeckName}
                  onChange={(event) => setNewDeckName(event.target.value)}
                  disabled={isGenerating}
                  className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2.5 text-sm text-white placeholder-[var(--nv-subtle)] outline-none transition-colors focus:border-[var(--nv-primary)]"
                />
              </div>
            )}
          </section>

          {selectedNoteCount > 0 && phase.kind === 'idle' && (
            <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--nv-subtle)]">Estimated Cards</span>
                <span className="text-lg font-extrabold text-[var(--nv-secondary)]">~{estimatedCards}</span>
              </div>
              <p className="mt-1 text-[0.65rem] text-[var(--nv-subtle)]">
                Minimum 3 cards per note. Longer notes can generate more.
              </p>
            </div>
          )}

          {phase.kind === 'reading' && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-4 text-sm text-[var(--nv-muted)]">
              <LoaderCircle className="h-4 w-4 animate-spin text-[var(--nv-primary)]" />
              <span>Reading note contents...</span>
            </div>
          )}

          {phase.kind === 'generating' && (
            <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-4">
              <div className="flex items-center gap-3 text-sm text-[var(--nv-muted)]">
                <LoaderCircle className="h-4 w-4 animate-spin text-[var(--nv-primary)]" />
                <span>
                  Generating... chunk {phase.current}/{phase.total}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--nv-border)]">
                <div
                  className="h-full rounded-full bg-[var(--nv-primary)] transition-all duration-300 shadow-[0_0_8px_var(--nv-primary-glow)]"
                  style={{ width: `${(phase.current / phase.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {phase.kind === 'saving' && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-4 text-sm text-[var(--nv-muted)]">
              <LoaderCircle className="h-4 w-4 animate-spin text-[var(--nv-primary)]" />
              <span>Saving cards to deck...</span>
            </div>
          )}

          {phase.kind === 'done' && (
            <div className="rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-4 text-sm text-white">
              <p className="font-bold">
                Added {phase.count} cards to <span className="text-[var(--nv-primary)]">{phase.deckName}</span>
              </p>
              <p className="mt-1 text-xs text-[var(--nv-muted)]">
                Close this modal and start reviewing your new flashcards.
              </p>
            </div>
          )}

          {phase.kind === 'error' && (
            <div className="rounded-lg border border-[var(--nv-danger)] bg-[var(--nv-danger-soft)] px-4 py-3 text-sm text-[var(--nv-foreground)]">
              {phase.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--nv-border)] px-6 py-4">
          <p className="text-xs text-[var(--nv-subtle)]">Powered by Groq</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isGenerating}
              className="px-5 py-2 text-sm font-bold text-[var(--nv-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase.kind === 'done' ? 'Close' : 'Cancel'}
            </button>
            {phase.kind !== 'done' && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
                className="flex items-center gap-2 rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-2 text-sm font-bold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary)] hover:text-[var(--nv-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
