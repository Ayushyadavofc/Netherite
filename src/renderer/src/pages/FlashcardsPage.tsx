import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronRight, Link2, Play, Settings, Sparkles, Trash2, Shuffle, X } from 'lucide-react'
import { ReviewCard } from '@/components/flashcards/review-card'
import { StatsOverview } from '@/components/flashcards/stats-overview'
import { RichTextarea } from '@/components/flashcards/rich-textarea'
import { GenerateFlashcardsModal } from '@/components/flashcards/GenerateFlashcardsModal'
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog'
import { extractMarkdownPreviewText } from '@/components/shared/MarkdownContent'
import { detectAttachmentKind, normalizePath, type AttachmentItem } from '@/lib/attachments'
import { emitPreChaosAppEvent } from '@/prechaos/app-events'
import { Toaster, toast } from 'sonner'

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export interface SM2Data {
  reps: number
  interval: number // In days, except implicitly handled during learning via steps
  ease: number
  nextReview: number
  state: CardState
  step: number
  lapses: number
}

export interface Card {
  id: string
  question: string
  answer: string
  sm2: SM2Data
}

export interface DeckSettings {
  newCardsPerDay: number
  maximumReviewsPerDay: number
  newCardsIgnoreReviewLimit: boolean
  limitsStartFromTop: boolean
  
  learningSteps: string
  graduatingInterval: number
  easyInterval: number
  insertionOrder: 'Sequential' | 'Random'
  
  relearningSteps: string
  minimumInterval: number
  leechThreshold: number
  leechAction: 'Suspend' | 'Tag Only'
  
  maximumInterval: number
  startingEase: number
  easyBonus: number
  intervalModifier: number
  hardInterval: number
  newInterval: number

  buryNewSiblings: boolean
  buryReviewSiblings: boolean
  buryInterdayLearningSiblings: boolean

  dontPlayAudioAutomatically: boolean
  skipQuestionWhenReplayingAnswer: boolean
  
  maximumAnswerSeconds: number
  showOnScreenTimer: boolean
  stopTimerOnAnswer: boolean

  secondsToShowQuestion: number
  secondsToShowAnswer: number
  waitForAudio: boolean
  questionAction: string
  answerAction: string

  newCardGatherOrder: string
  newCardSortOrder: string
  newReviewOrder: string
  interdayLearningReviewOrder: string
  reviewSortOrder: string
}

export const defaultDeckSettings: DeckSettings = {
  newCardsPerDay: 20,
  maximumReviewsPerDay: 200,
  newCardsIgnoreReviewLimit: false,
  limitsStartFromTop: false,
  
  learningSteps: '1 10', // simplified to generic numbers '1 10' representing minutes
  graduatingInterval: 1,
  easyInterval: 4,
  insertionOrder: 'Sequential',
  
  relearningSteps: '10',
  minimumInterval: 1,
  leechThreshold: 8,
  leechAction: 'Tag Only',
  
  maximumInterval: 36500,
  startingEase: 2.5,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  hardInterval: 1.2,
  newInterval: 0.0,

  buryNewSiblings: false,
  buryReviewSiblings: false,
  buryInterdayLearningSiblings: false,

  dontPlayAudioAutomatically: false,
  skipQuestionWhenReplayingAnswer: false,

  maximumAnswerSeconds: 60,
  showOnScreenTimer: false,
  stopTimerOnAnswer: false,

  secondsToShowQuestion: 0.0,
  secondsToShowAnswer: 0.0,
  waitForAudio: true,
  questionAction: 'Show Answer',
  answerAction: 'Bury Card',

  newCardGatherOrder: 'Deck',
  newCardSortOrder: 'Card type, then order gathered',
  newReviewOrder: 'Mix with reviews',
  interdayLearningReviewOrder: 'Mix with reviews',
  reviewSortOrder: 'Due date, then random'
}

export interface Deck {
  id: string
  name: string
  fileName: string
  total: number
  dueToday: number
  newCards: number
  lastStudied: string
  isOverdue: boolean
  settings: DeckSettings
  cards: Card[]
}

export function calculateSM2(
  quality: number, 
  sm2: SM2Data,
  settings: DeckSettings = defaultDeckSettings
): SM2Data {
  let { reps, interval, ease, state, step, lapses } = sm2

  const now = Date.now()
  const learningSteps = settings.learningSteps.split(' ').map(Number)
  const relearningSteps = settings.relearningSteps.split(' ').map(Number)

  if (state === 'new' || state === 'learning') {
    if (quality === 0) {
      step = 0
      state = 'learning'
      interval = learningSteps[0] || 1
    } else if (quality === 3) {
      state = 'learning'
      interval = learningSteps[step] || 1
    } else if (quality === 4) {
      step++
      if (step >= learningSteps.length) {
        state = 'review'
        interval = settings.graduatingInterval * 24 * 60
        reps = 1
      } else {
        state = 'learning'
        interval = learningSteps[step]
      }
    } else if (quality === 5) {
      state = 'review'
      interval = settings.easyInterval * 24 * 60
      reps = 1
    }
  } else if (state === 'review') {
    if (quality === 0) {
      lapses++
      state = 'relearning'
      step = 0
      interval = relearningSteps[0] || 1
      ease = Math.max(1.3, ease - 0.2)
    } else if (quality === 3) {
      interval = Math.round(interval * settings.hardInterval)
      ease = Math.max(1.3, ease - 0.15)
    } else if (quality === 4) {
      interval = Math.round(interval * ease * settings.intervalModifier)
    } else if (quality === 5) {
      interval = Math.round(interval * ease * settings.intervalModifier * settings.easyBonus)
      ease += 0.15
    }
    
    if (state === 'review') {
      const minInterval = settings.minimumInterval * 24 * 60
      const maxInterval = settings.maximumInterval * 24 * 60
      if (interval < minInterval) interval = minInterval
      if (interval > maxInterval) interval = maxInterval
    }
  } else if (state === 'relearning') {
    if (quality === 0) {
      step = 0
      interval = relearningSteps[0] || 1
    } else if (quality === 3) {
      interval = relearningSteps[step] || 1
    } else if (quality === 4) {
      step++
      if (step >= relearningSteps.length) {
        state = 'review'
        interval = Math.max(settings.minimumInterval * 24 * 60, interval * settings.newInterval)
      } else {
        interval = relearningSteps[step]
      }
    } else if (quality === 5) {
      state = 'review'
      interval = Math.max(settings.minimumInterval * 24 * 60, interval * settings.newInterval)
    }
  }

  const safeInterval = isNaN(interval) || interval <= 0 ? 1 : interval
  const nextReview = now + safeInterval * 60 * 1000
  return { reps, interval: safeInterval, ease, nextReview, state, step, lapses }
}

function parseDeckFile(content: string, fileName: string): Deck {
  const name = fileName.replace(/\.md$/, '').split('/').pop() || fileName
  const deck: Deck = {
    id: fileName,
    name,
    fileName,
    cards: [],
    total: 0,
    dueToday: 0,
    newCards: 0,
    lastStudied: 'Never',
    isOverdue: false,
    settings: { ...defaultDeckSettings }
  }

  const blocks = content.split(/^---$/m)
  
  if (blocks[0]) {
    const settingsMatch = blocks[0].match(/<!-- AnkiSettings:\s*(\{.*?\})\s*-->/)
    if (settingsMatch) {
      try { deck.settings = { ...deck.settings, ...JSON.parse(settingsMatch[1]) } } catch {}
    }
  }

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].trim()
    if (!block) continue

  const rx = /^Q:\s*([\s\S]*?)^\s*A:\s*([\s\S]*?)(?:^\s*<!-- SM2:\s*(\{.*?\})\s*-->|$)/m
    const match = block.match(rx)

    if (match) {
      const question = match[1].trim()
      const answer = match[2].trim()
      let sm2: SM2Data = { 
        reps: 0, 
        interval: 0, 
        ease: deck.settings.startingEase, 
        nextReview: 0,
        state: 'new',
        step: 0,
        lapses: 0 
      }
      if (match[3]) {
        try { sm2 = { ...sm2, ...JSON.parse(match[3]) } } catch {}
      }
      deck.cards.push({ id: crypto.randomUUID(), question, answer, sm2 })
    }
  }

  deck.total = deck.cards.length
  deck.newCards = deck.cards.filter(c => c.sm2.reps === 0).length
  deck.dueToday = deck.cards.filter(c => c.sm2.reps > 0 && c.sm2.nextReview <= Date.now()).length
  deck.isOverdue = deck.dueToday > 0

  return deck
}

function formatInterval(mins: number) {
  if (mins < 60) return `${Math.round(mins)}m`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days >= 365) return `${(days / 365).toFixed(1)}y`
  if (days >= 30) return `${(days / 30).toFixed(1)}mo`
  return `${Math.round(days)}d`
}

const isAbsolutePathLike = (value: string) => /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('/')

const isInsideVault = (filePath: string, vaultPath: string): boolean => {
  const normalizeForCompare = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const resolved = normalizeForCompare(filePath)
  const vaultResolved = normalizeForCompare(vaultPath)
  return resolved.startsWith(`${vaultResolved}/`)
}

function collectAttachmentItems(nodes: any[], vaultPath: string) {
  const attachments: AttachmentItem[] = []

  const visit = (items: any[]) => {
    for (const item of items) {
      const relativePath = normalizePath(item.path || '')
      if (item.type === 'folder') {
        if (item.children) visit(item.children)
        continue
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
  return attachments.sort((a, b) => a.name.localeCompare(b.name))
}

export default function FlashcardsPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [isStudying, setIsStudying] = useState(false)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)

  const [showCreateDeck, setShowCreateDeck] = useState(false)
  const [newDeckName, setNewDeckName] = useState("")

  const [showAddCard, setShowAddCard] = useState(false)
  const [newQuestion, setNewQuestion] = useState("")
  const [newAnswer, setNewAnswer] = useState("")
  const [attachmentItems, setAttachmentItems] = useState<AttachmentItem[]>([])

  const [showRemoveCard, setShowRemoveCard] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const hasMountedStudyStateRef = useRef(false)

  useEffect(() => {
    if (!hasMountedStudyStateRef.current) {
      hasMountedStudyStateRef.current = true
      return
    }

    if (isStudying) {
      return
    }

    emitPreChaosAppEvent({
      source: 'flashcards',
      action: 'flashcard_session_ended',
      label: 'Flashcard review session ended',
      importance: 'low'
    })
  }, [hasMountedStudyStateRef, isStudying])

  const loadDecks = async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    const flashcardsDir = `${vaultPath}/flashcards`
    try {
      await window.electronAPI.createFolder(flashcardsDir)
    } catch {}

    try {
      const files = await window.electronAPI.readFolder(flashcardsDir, { includeMarkdownContent: true })
      const deckFiles = files.filter((f: any) => f.type === 'file' && f.name.endsWith('.md'))

      const loadedDecks: Deck[] = []
      for (const f of deckFiles) {
        if (f.content) {
          loadedDecks.push(parseDeckFile(f.content, f.name))
        } else {
          try {
            const content = await window.electronAPI.readFile(`${flashcardsDir}/${f.name}`)
            loadedDecks.push(parseDeckFile(content, f.name))
          } catch(e) {}
        }
      }
      // Load external decks
      const externalRefsPath = `${flashcardsDir}/externalDecks.json`
      let externalPaths: string[] = []
      try {
        if (await window.electronAPI.fileExists(externalRefsPath)) {
          const content = await window.electronAPI.readFile(externalRefsPath)
          externalPaths = JSON.parse(content)
          if (!Array.isArray(externalPaths)) externalPaths = []
        } else {
          await window.electronAPI.writeFile(externalRefsPath, '[]')
        }
      } catch(e) {}

      for (const deckPath of externalPaths) {
        if (!isInsideVault(deckPath, vaultPath)) {
          console.warn('Blocked external deck path outside vault:', deckPath)
          continue
        }

        try {
          const content = await window.electronAPI.readFile(deckPath)
          loadedDecks.push(parseDeckFile(content, deckPath))
        } catch(e) {}
      }

      setDecks(loadedDecks)
    } catch (err) {
      console.error('Failed to load flashcards:', err)
    }
  }

  const loadAttachmentItems = async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    try {
      const nodes = await window.electronAPI.readFolder(vaultPath, { includeMarkdownContent: false })
      setAttachmentItems(collectAttachmentItems(nodes, vaultPath))
    } catch (err) {
      console.error('Failed to load flashcard attachments:', err)
    }
  }

  useEffect(() => {
    void loadDecks()
    void loadAttachmentItems()
  }, [])

  const saveDeck = async (deck: Deck) => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return false
    const isAbsolute = isAbsolutePathLike(deck.fileName)
    const fullPath = isAbsolute ? deck.fileName : `${vaultPath}/flashcards/${deck.fileName}`

    let content = `# ${deck.name}\n`
    content += `<!-- AnkiSettings: ${JSON.stringify(deck.settings)} -->\n\n`
    for (const card of deck.cards) {
      content += `---\n`
      content += `Q: ${card.question}\n`
      content += `A: ${card.answer}\n`
      content += `<!-- SM2: ${JSON.stringify(card.sm2)} -->\n\n`
    }

    try {
      await window.electronAPI.writeFile(fullPath, content)
      setDecks(prev => prev.map(d => d.id === deck.id ? deck : d))
      return true
    } catch (err) {
      toast.error('Save failed — your changes may not have been written to disk.')
      console.error('Failed to save deck:', err)
      return false
    }
  }

  const selectedDeck = decks.find(d => d.id === selectedDeckId) || null

  const getStudyCards = (sourceCards: any[], settings: DeckSettings) => {
    // Learning/relearning bypass daily limits
    const learning = sourceCards.filter(c => (c.sm2.state === 'learning' || c.sm2.state === 'relearning') && c.sm2.nextReview <= Date.now())
    const due = sourceCards.filter(c => c.sm2.state === 'review' && c.sm2.nextReview <= Date.now())
    const newCards = sourceCards.filter(c => c.sm2.state === 'new')

    const allowedReview = due.slice(0, settings.maximumReviewsPerDay)
    const reviewLimitRemaining = settings.maximumReviewsPerDay - allowedReview.length
    
    // newCardsIgnoreReviewLimit logic
    const effNewLimit = settings.newCardsIgnoreReviewLimit 
      ? settings.newCardsPerDay 
      : Math.min(settings.newCardsPerDay, reviewLimitRemaining)

    const allowedNew = newCards.slice(0, effNewLimit)

    return [...learning, ...allowedReview, ...allowedNew]
  }

  const allCards = decks.flatMap(d => d.cards.map(c => ({...c, _deckId: d.id, _settings: d.settings})))
  const studyCards = selectedDeck 
    ? getStudyCards(selectedDeck.cards.map(c => ({...c, _deckId: selectedDeck.id})), selectedDeck.settings)
    : getStudyCards(allCards, defaultDeckSettings)

  const handleStudyDeck = (deckId?: string) => {
    if (deckId) setSelectedDeckId(deckId)
    emitPreChaosAppEvent({
      source: 'flashcards',
      action: 'flashcard_session_started',
      label: deckId ? 'Started a flashcard deck review' : 'Started a flashcard review session',
      importance: 'high'
    })
    setIsStudying(true)
    setCurrentCardIndex(0)
  }

  const handleStudyAllMixed = () => {
    setSelectedDeckId(null)
    emitPreChaosAppEvent({
      source: 'flashcards',
      action: 'flashcard_session_started',
      label: 'Started a mixed flashcard review session',
      importance: 'high'
    })
    setIsStudying(true)
    setCurrentCardIndex(0)
  }

  const handleResponse = async (response: 'again' | 'hard' | 'good' | 'easy') => {
    const qualityMap = { again: 0, hard: 3, good: 4, easy: 5 }
    const current = studyCards[currentCardIndex]
    
    // Update SM2
    const originalDeck = decks.find(d => d.id === current._deckId)
    if (originalDeck) {
      const updatedCard = { ...current, sm2: calculateSM2(qualityMap[response], current.sm2, originalDeck.settings) }
      const updatedDeck = {
        ...originalDeck,
        cards: originalDeck.cards.map(c => c.id === current.id ? updatedCard : c)
      }
      
      updatedDeck.newCards = updatedDeck.cards.filter(c => c.sm2.reps === 0).length
      updatedDeck.dueToday = updatedDeck.cards.filter(c => c.sm2.reps > 0 && c.sm2.nextReview <= Date.now()).length
      
      const saved = await saveDeck(updatedDeck)
      if (!saved) return
      emitPreChaosAppEvent({
        source: 'flashcards',
        action: response === 'good' || response === 'easy' ? 'flashcard_success' : 'flashcard_review',
        label:
          response === 'good' || response === 'easy'
            ? `Successful flashcard review: ${response}`
            : `Flashcard review response: ${response}`,
        importance: response === 'good' || response === 'easy' ? 'high' : 'medium',
        metadata: { response }
      })
    }

    if (currentCardIndex < studyCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1)
    } else {
      setIsStudying(false)
      setCurrentCardIndex(0)
    }
  }

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const safeDeckName = newDeckName
      .replace(/[/\\]/g, '')
      .replace(/\.\./g, '')
      .trim()

    if (!safeDeckName) return

    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    const fileName = `${safeDeckName}.md`
    const newDeck: Deck = {
      id: fileName,
      name: safeDeckName,
      fileName,
      cards: [],
      total: 0,
      dueToday: 0,
      newCards: 0,
      lastStudied: 'Never',
      isOverdue: false,
      settings: { ...defaultDeckSettings }
    }

    const saved = await saveDeck(newDeck)
    if (!saved) return
    emitPreChaosAppEvent({
      source: 'flashcards',
      action: 'deck_created',
      label: 'Created a flashcard deck',
      importance: 'medium'
    })
    setDecks([...decks, newDeck])
    setShowCreateDeck(false)
    setNewDeckName("")
  }

  const handleAddCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeck || !newQuestion.trim() || !newAnswer.trim()) return

    const newCard: Card = {
      id: crypto.randomUUID(),
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      sm2: { reps: 0, interval: 0, ease: selectedDeck.settings.startingEase, nextReview: 0, state: 'new', step: 0, lapses: 0 }
    }

    const updatedDeck = { ...selectedDeck, cards: [...selectedDeck.cards, newCard] }
    updatedDeck.total++
    updatedDeck.newCards++

    const saved = await saveDeck(updatedDeck)
    if (!saved) return
    emitPreChaosAppEvent({
      source: 'flashcards',
      action: 'card_created',
      label: 'Added a flashcard',
      importance: 'medium'
    })
    await loadAttachmentItems()
    setShowAddCard(false)
    setNewQuestion("")
    setNewAnswer("")
  }

  const handleRemoveCard = async (cardId: string) => {
    if (!selectedDeck) return
    const updatedCards = selectedDeck.cards.filter(c => c.id !== cardId)
    const updatedDeck = { ...selectedDeck, cards: updatedCards }
    updatedDeck.total = updatedCards.length
    updatedDeck.newCards = updatedCards.filter(c => c.sm2.reps === 0).length
    updatedDeck.dueToday = updatedCards.filter(c => c.sm2.reps > 0 && c.sm2.nextReview <= Date.now()).length

    await saveDeck(updatedDeck)
  }

  const handleDeleteDeck = async (deck: Deck) => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    const flashcardsDir = `${vaultPath}/flashcards`
    const externalRefsPath = `${flashcardsDir}/externalDecks.json`

    try {
      if (isAbsolutePathLike(deck.fileName)) {
        let externalPaths: string[] = []
        if (await window.electronAPI.fileExists(externalRefsPath)) {
          const content = await window.electronAPI.readFile(externalRefsPath)
          const parsed = JSON.parse(content)
          externalPaths = Array.isArray(parsed) ? parsed : []
        }

        const normalizedDeckPath = deck.fileName.replace(/\\/g, '/')
        const nextExternalPaths = externalPaths.filter((entry) => entry.replace(/\\/g, '/') !== normalizedDeckPath)
        await window.electronAPI.writeFile(externalRefsPath, JSON.stringify(nextExternalPaths, null, 2))
      }

      const fullPath = isAbsolutePathLike(deck.fileName) ? deck.fileName : `${vaultPath}/flashcards/${deck.fileName}`
      await window.electronAPI.deleteVaultItem(fullPath)
      setDecks((current) => current.filter((item) => item.id !== deck.id))
      setSelectedDeckId((current) => (current === deck.id ? null : current))
    } catch (error) {
      toast.error('Could not delete this deck.')
      console.error(error)
    }
  }

  const handleLinkExternalDeck = async () => {
    const vaultPath = localStorage.getItem('netherite-current-vault-path')
    if (!vaultPath) return

    const filePath = await window.electronAPI.selectFile([{ name: 'Markdown Decks', extensions: ['md'] }])
    if (!filePath) return

    const flashcardsDir = `${vaultPath}/flashcards`
    const externalRefsPath = `${flashcardsDir}/externalDecks.json`
    let externalPaths: string[] = []
    try {
      if (await window.electronAPI.fileExists(externalRefsPath)) {
        const content = await window.electronAPI.readFile(externalRefsPath)
        externalPaths = JSON.parse(content)
        if (!Array.isArray(externalPaths)) externalPaths = []
      } else {
        await window.electronAPI.writeFile(externalRefsPath, '[]')
      }
    } catch(e) {}

    const normalizedPath = filePath.replace(/\\/g, '/')
    if (!isInsideVault(normalizedPath, vaultPath)) {
      console.warn('Blocked external deck path outside vault:', normalizedPath)
      return
    }

    if (!externalPaths.includes(normalizedPath)) {
      externalPaths.push(normalizedPath)
      await window.electronAPI.writeFile(externalRefsPath, JSON.stringify(externalPaths, null, 2))
      
      try {
        const content = await window.electronAPI.readFile(normalizedPath)
        const newDeck = parseDeckFile(content, normalizedPath)
        setDecks(prev => [...prev, newDeck])
      } catch (e) {}
    }
  }

  const [showSettings, setShowSettings] = useState(false)
  const [pendingDeckDelete, setPendingDeckDelete] = useState<Deck | null>(null)
  const [deckSettingsForm, setDeckSettingsForm] = useState<DeckSettings>(defaultDeckSettings)

  const openSettingsModal = () => {
    if (!selectedDeck) return
    setDeckSettingsForm(selectedDeck.settings)
    setShowSettings(true)
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeck) return
    const updatedDeck = { ...selectedDeck, settings: deckSettingsForm }
    const saved = await saveDeck(updatedDeck)
    if (!saved) return
    setShowSettings(false)
  }

  const currentCard = studyCards[currentCardIndex]
  const currentDeckSettings = selectedDeck?.settings || defaultDeckSettings
  const sm2Intervals = currentCard ? {
    again: formatInterval(calculateSM2(0, currentCard.sm2, currentDeckSettings).interval),
    hard: formatInterval(calculateSM2(3, currentCard.sm2, currentDeckSettings).interval),
    good: formatInterval(calculateSM2(4, currentCard.sm2, currentDeckSettings).interval),
    easy: formatInterval(calculateSM2(5, currentCard.sm2, currentDeckSettings).interval)
  } : undefined

  const totalDue = decks.reduce((s, d) => s + d.dueToday, 0)
  const totalNew = decks.reduce((s, d) => s + d.newCards, 0)
  const totalCards = decks.reduce((s, d) => s + d.total, 0)
  const newAndLearningTracker = decks.reduce((s, d) => s + d.cards.filter(c => c.sm2.reps <= 1).length, 0)

  // Pie chart values 
  const mastered = totalCards - newAndLearningTracker
  const learning = newAndLearningTracker - totalNew
  const unseen = totalNew
  const pieTotal = totalCards || 1

  return (
    <div className="flex w-full h-full bg-[var(--nv-bg)]">
      <Toaster richColors theme="dark" />
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 z-10 sticky top-0 h-[calc(100vh-48px)] overflow-y-auto border-r border-[var(--nv-border)] bg-[var(--nv-bg)]">
        {/* Header */}
        <div className="p-6 pb-4">
          <h2 className="text-xs font-bold text-[var(--nv-secondary)] uppercase tracking-[0.15em] mb-4">Decks</h2>
        </div>

        {/* Deck list */}
        <div className="flex-1 overflow-y-auto px-3">
          {decks.map(deck => {
            const isActive = selectedDeckId === deck.id && !isStudying
            return (
              <div
                key={deck.id}
                className={`group mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-all ${
                  isActive
                    ? 'border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]'
                    : 'border border-transparent hover:bg-[var(--nv-surface)]'
                }`}
                onClick={() => {
                  setSelectedDeckId(deck.id)
                  setIsStudying(false)
                  emitPreChaosAppEvent({
                    source: 'flashcards',
                    action: 'flashcard_deck_opened',
                    label: 'Opened a flashcard deck',
                    importance: 'medium'
                  })
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-[var(--nv-primary)]' : 'text-white'}`}>{deck.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {deck.dueToday > 0 && (
                        <span className={`text-[0.55rem] font-bold uppercase tracking-wider ${deck.isOverdue ? 'text-[var(--nv-danger)]' : 'text-[var(--nv-primary)]'}`}>
                          {deck.dueToday} due
                        </span>
                      )}
                      {deck.newCards > 0 && (
                        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-[var(--nv-secondary)]">
                          {deck.newCards} new
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPendingDeckDelete(deck)
                  }}
                  className="rounded-md p-1 text-[var(--nv-subtle)] opacity-0 transition-all hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)] group-hover:opacity-100"
                  aria-label={`Delete deck ${deck.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[var(--nv-primary)]' : 'text-[var(--nv-subtle)] group-hover:text-white'}`} />
              </div>
            )
          })}
          {decks.length === 0 && (
             <p className="text-xs text-[var(--nv-subtle)] px-3 my-4 italic">No decks found...</p>
          )}
        </div>

        <div className="p-4 flex flex-col gap-2">
          <button onClick={() => setShowGenerateModal(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--nv-primary-soft)] text-[var(--nv-secondary)] rounded-lg font-bold text-[0.7rem] uppercase tracking-widest hover:bg-[var(--nv-primary-soft-strong)] hover:text-[var(--nv-primary)] transition-colors">
            <Sparkles className="w-4 h-4" />
            Generate with AI ✨
          </button>
          <button onClick={() => setShowCreateDeck(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] rounded-lg font-bold text-[0.7rem] uppercase tracking-widest hover:bg-[var(--nv-primary-soft-strong)] transition-colors">
            <Plus className="w-4 h-4" />
            Create Deck
          </button>
          <button onClick={handleLinkExternalDeck} className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--nv-surface)] border border-[var(--nv-border)] text-[var(--nv-muted)] rounded-lg font-bold text-[0.7rem] uppercase tracking-widest hover:border-white hover:text-white transition-colors">
            <Link2 className="h-4 w-4" />
            Link Deck
          </button>
        </div>

        {/* Session Stats */}
        {isStudying && (
          <div className="mx-4 mb-4 p-4 bg-[var(--nv-surface-strong)] border border-[var(--nv-border)] rounded-lg">
            <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] mb-3 font-bold">Session</h4>
            <div className="flex justify-between items-end mb-3">
              <span className="text-[var(--nv-muted)] text-xs uppercase">Remaining</span>
              <span className="text-xl font-bold text-white font-headline">{studyCards.length - currentCardIndex}</span>
            </div>
            <div className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] h-1.5 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-[var(--nv-primary)] transition-all duration-300 shadow-[0_0_8px_var(--nv-primary-glow)]" 
                style={{ width: `${(currentCardIndex / Math.max(1, studyCards.length)) * 100}%` }}
              />
            </div>
            <button 
               onClick={() => { setIsStudying(false) }}
               className="mt-3 w-full py-2 bg-transparent border border-[var(--nv-border)] text-[var(--nv-muted)] rounded font-bold text-[0.6rem] uppercase tracking-widest hover:border-white hover:text-white transition-colors"
            >
               Abort Session
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <section className="flex-grow flex flex-col z-10 overflow-y-auto relative">
        {isStudying && currentCard ? (
          <ReviewCard
            question={currentCard.question}
            answer={currentCard.answer}
            attachmentItems={attachmentItems}
            currentCard={currentCardIndex + 1}
            totalCards={studyCards.length}
            onResponse={handleResponse}
            sm2Intervals={sm2Intervals}
            settings={currentDeckSettings}
          />
        ) : selectedDeck ? (
          <div className="p-8 md:p-12 max-w-4xl mx-auto w-full">
            <div className="mb-8">
              <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[var(--nv-subtle)] mb-1">Deck Details</p>
              <h1 className="text-3xl font-extrabold text-white font-headline">{selectedDeck.name}</h1>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-5">
                <p className="text-3xl font-extrabold text-white font-headline">{selectedDeck.total}</p>
                <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--nv-subtle)] mt-1">Total Cards</p>
              </div>
              <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-5">
                <p className="text-3xl font-extrabold text-[var(--nv-primary)] font-headline">{selectedDeck.dueToday}</p>
                <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--nv-subtle)] mt-1">Due Today</p>
              </div>
              <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-5">
                <p className="text-3xl font-extrabold text-[var(--nv-secondary)] font-headline">{selectedDeck.newCards}</p>
                <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--nv-subtle)] mt-1">New Cards</p>
              </div>
              <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-lg p-5">
                <p className="text-xs font-bold text-[var(--nv-muted)]">{selectedDeck.lastStudied}</p>
                <p className="text-[0.6rem] uppercase tracking-widest font-bold text-[var(--nv-subtle)] mt-1">Last Studied</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => handleStudyDeck(selectedDeck.id)}
                disabled={studyCards.length === 0}
                className="flex items-center gap-2 rounded-lg border border-[var(--nv-primary)] px-6 py-3 text-sm font-bold uppercase tracking-widest text-[var(--nv-primary)] bg-[var(--nv-primary-soft)] transition-all hover:bg-[var(--nv-primary-soft-strong)] hover:shadow-[0_0_12px_var(--nv-primary-glow)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Start Session
              </button>
              <button onClick={() => setShowAddCard(true)} className="flex items-center gap-2 px-6 py-3 bg-transparent border border-[var(--nv-border)] text-[var(--nv-muted)] rounded-lg font-bold text-sm hover:border-[var(--nv-secondary)] hover:text-[var(--nv-secondary)] transition-all uppercase tracking-widest">
                <Plus className="w-4 h-4" />
                Add Card
              </button>
              <button onClick={() => setShowRemoveCard(true)} className="flex items-center gap-2 rounded-lg border border-[var(--nv-border)] bg-transparent px-6 py-3 text-sm font-bold uppercase tracking-widest text-[var(--nv-muted)] transition-all hover:border-[var(--nv-danger)] hover:text-[var(--nv-danger)]">
                <Trash2 className="w-4 h-4" />
                Remove Card
              </button>
              <button onClick={openSettingsModal} className="flex items-center gap-2 px-6 py-3 bg-transparent border border-[var(--nv-border)] text-[var(--nv-muted)] rounded-lg font-bold text-sm hover:border-white hover:text-white transition-all uppercase tracking-widest">
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 md:p-12 max-w-5xl mx-auto w-full space-y-12">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[var(--nv-subtle)] mb-1">Overview</p>
              <h1 className="text-3xl font-extrabold text-white font-headline">Flashcards</h1>
            </div>

            <div className="grid gap-12 xl:grid-cols-[minmax(280px,0.35fr)_minmax(0,0.65fr)] xl:items-start">
              <div className="min-w-0">
                <h2 className="mb-6 text-sm font-bold text-[var(--nv-secondary)] uppercase tracking-[0.2em]">Global Metrics</h2>
                <StatsOverview 
                  todayReview={totalDue}
                  newCards={totalNew}
                  learningCards={learning}
                  dueCards={totalDue}
                  totalCards={totalCards}
                  mastered={mastered}
                  streak={12}
                />
              </div>

              <div className="min-w-0 space-y-6">
                <div className="rounded-[20px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 md:p-7">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-xl">
                      <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-white">Mixed Review</h3>
                      <p className="text-sm text-[var(--nv-subtle)]">Study all cards from every deck shuffled together.</p>
                    </div>
                    <button
                      onClick={handleStudyAllMixed}
                      disabled={studyCards.length === 0}
                      className="flex items-center gap-2 rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-[var(--nv-primary)] transition-all hover:bg-[var(--nv-primary-soft-strong)] hover:shadow-[0_0_12px_var(--nv-primary-glow)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Shuffle className="w-4 h-4" />
                      Study All
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.46fr)_minmax(0,0.54fr)]">
                  <div className="rounded-[20px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
                    <h3 className="mb-5 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-[var(--nv-muted)]">Card Distribution</h3>
                    <div className="flex flex-col items-center gap-5">
                      <div className="relative h-44 w-44">
                        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--nv-border)" strokeWidth="4" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--nv-primary)" strokeWidth="4"
                            strokeDasharray={`${(mastered / pieTotal) * 88} 88`}
                            strokeDashoffset="0"
                          />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="var(--nv-secondary)" strokeWidth="4"
                            strokeDasharray={`${(learning / pieTotal) * 88} 88`}
                            strokeDashoffset={`${-(mastered / pieTotal) * 88}`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-extrabold text-white font-headline">{totalCards}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[0.55rem] uppercase tracking-widest font-bold">
                        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[var(--nv-primary)]" /><span className="text-[var(--nv-muted)]">Mastered</span></div>
                        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[var(--nv-secondary)]" /><span className="text-[var(--nv-muted)]">Learning</span></div>
                        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[var(--nv-border)]" /><span className="text-[var(--nv-muted)]">Unseen</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 self-stretch sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="flex min-h-[150px] flex-col justify-between rounded-[20px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5">
                      <div className="text-[0.55rem] font-bold uppercase tracking-[0.24em] text-[var(--nv-subtle)]">Total Due</div>
                      <p className="text-4xl font-extrabold text-[var(--nv-danger)] font-headline">{totalDue}</p>
                    </div>
                    <div className="flex min-h-[150px] flex-col justify-between rounded-[20px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5">
                      <div className="text-[0.55rem] font-bold uppercase tracking-[0.24em] text-[var(--nv-subtle)]">Total New</div>
                      <p className="text-4xl font-extrabold text-[var(--nv-secondary)] font-headline">{totalNew}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      <GenerateFlashcardsModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        decks={decks}
        onDecksChanged={loadDecks}
      />

      <DeleteConfirmDialog
        open={pendingDeckDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeckDelete(null)
          }
        }}
        title={pendingDeckDelete ? `Delete deck "${pendingDeckDelete.name}"?` : 'Delete deck?'}
        description="This deck file will be removed from your vault. This cannot be undone."
        onConfirm={() => {
          if (pendingDeckDelete) {
            void handleDeleteDeck(pendingDeckDelete)
            setPendingDeckDelete(null)
          }
        }}
      />

      {showCreateDeck && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
          <form onSubmit={handleCreateDeckSubmit} className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-xl p-8 w-full max-w-md shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <h3 className="text-xl font-bold text-white mb-6">Create New Deck</h3>
            <input 
              autoFocus
              className="w-full bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded-lg py-3 px-4 text-white focus:border-[var(--nv-primary)] outline-none transition-colors mb-6 font-mono text-sm"
              placeholder="Deck Name (e.g. Science)"
              value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
            />
            <div className="flex gap-4 justify-end">
              <button type="button" onClick={() => setShowCreateDeck(false)} className="px-5 py-2 text-[var(--nv-muted)] hover:text-white transition-colors text-sm font-bold">Cancel</button>
              <button type="submit" className="rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-2 text-sm font-bold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary)] hover:text-[var(--nv-foreground)]">Create Deck</button>
            </div>
          </form>
        </div>
      )}

      {showAddCard && (
        <div className="absolute inset-0 z-[100] overflow-y-auto bg-black/80 p-6 backdrop-blur-sm">
          <form onSubmit={handleAddCardSubmit} className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <h3 className="text-xl font-bold text-white font-headline">Add Card to {selectedDeck?.name}</h3>
            
            <RichTextarea value={newQuestion} onChange={setNewQuestion} label="Question" minHeight="220px" />
            <RichTextarea value={newAnswer} onChange={setNewAnswer} label="Answer" minHeight="220px" />

            <div className="mt-2 flex justify-end gap-4">
              <button type="button" onClick={() => setShowAddCard(false)} className="px-5 py-2 text-[var(--nv-muted)] hover:text-white transition-colors text-sm font-bold">Cancel</button>
              <button type="submit" className="rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-2 text-sm font-bold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary)] hover:text-[var(--nv-foreground)]">Save Card</button>
            </div>
          </form>
        </div>
      )}

      {showRemoveCard && selectedDeck && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] py-12">
          <div className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-xl p-8 w-full max-w-3xl h-full max-h-[80vh] flex flex-col gap-6 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <div className="flex justify-between items-center border-b border-[var(--nv-border)] pb-4 shrink-0">
              <h3 className="text-2xl font-bold text-white font-headline">Remove Cards</h3>
              <button onClick={() => setShowRemoveCard(false)} className="text-[var(--nv-muted)] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {selectedDeck.cards.length === 0 && <p className="text-[var(--nv-muted)] text-sm py-8 text-center italic">No cards in this deck.</p>}
              {selectedDeck.cards.map(card => (
                <div key={card.id} className="flex gap-4 items-start p-4 bg-[var(--nv-bg)] border border-[var(--nv-border)] rounded-lg hover:border-[var(--nv-border)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-bold mb-2 break-words leading-relaxed">{extractMarkdownPreviewText(card.question) || 'Untitled question'}</p>
                    <p className="text-xs text-[var(--nv-muted)] break-words leading-relaxed">{extractMarkdownPreviewText(card.answer) || 'No answer'}</p>
                    <p className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-subtle)] mt-3 font-bold">Reps: {card.sm2.reps} · Ease: {card.sm2.ease.toFixed(2)}</p>
                  </div>
                  <button 
                    onClick={() => handleRemoveCard(card.id)}
                    className="rounded-lg p-3 text-[var(--nv-danger)] opacity-70 transition-all hover:bg-[var(--nv-danger-soft)] hover:opacity-100"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && selectedDeck && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] py-12">
          <form onSubmit={handleSaveSettings} className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded-xl p-8 w-full max-w-4xl max-h-[90vh] flex flex-col gap-6 shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-y-auto relative">
            <div className="flex justify-between items-center border-b border-[var(--nv-border)] pb-4 shrink-0 sticky top-0 bg-[var(--nv-surface)] z-10 w-full">
              <h3 className="text-2xl font-bold text-white font-headline">Deck Options: {selectedDeck.name}</h3>
              <button type="button" onClick={() => setShowSettings(false)} className="text-[var(--nv-muted)] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-6 border-b border-[var(--nv-border)]">
              {/* Daily Limits */}
              <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Daily Limits</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">New cards/day</label>
                    <input type="number" step="1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.newCardsPerDay} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, newCardsPerDay: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Maximum reviews/day</label>
                    <input type="number" step="1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.maximumReviewsPerDay} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, maximumReviewsPerDay: val})) } }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">New cards ignore review limit</label>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.newCardsIgnoreReviewLimit} onChange={e => setDeckSettingsForm(p => ({...p, newCardsIgnoreReviewLimit: e.target.checked}))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Limits start from top</label>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.limitsStartFromTop} onChange={e => setDeckSettingsForm(p => ({...p, limitsStartFromTop: e.target.checked}))} />
                  </div>
                </div>
              </div>

              {/* New Cards */}
              <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-secondary)] font-bold mb-4">New Cards</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Learning steps (mins space-separated)</label>
                    <input type="text" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.learningSteps} onChange={e => setDeckSettingsForm(p => ({...p, learningSteps: e.target.value}))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Graduating Interval (days)</label>
                    <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.graduatingInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, graduatingInterval: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Easy Interval (days)</label>
                    <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.easyInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, easyInterval: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Insertion order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.insertionOrder} onChange={e => setDeckSettingsForm(p => ({...p, insertionOrder: e.target.value as 'Sequential'|'Random'}))}
                    >
                      <option value="Sequential">Sequential (oldest cards first)</option>
                      <option value="Random">Random</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Lapses */}
              <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-danger)] font-bold mb-4">Lapses</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Relearning steps (mins space-separated)</label>
                    <input type="text" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.relearningSteps} onChange={e => setDeckSettingsForm(p => ({...p, relearningSteps: e.target.value}))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Minimum Interval (days)</label>
                    <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.minimumInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, minimumInterval: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Leech threshold</label>
                    <input type="number" step="1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.leechThreshold} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, leechThreshold: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Leech action</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.leechAction} onChange={e => setDeckSettingsForm(p => ({...p, leechAction: e.target.value as 'Suspend'|'Tag Only'}))}
                    >
                      <option value="Suspend">Suspend</option>
                      <option value="Tag Only">Tag Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Advanced */}
              <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Advanced</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Maximum interval (days)</label>
                    <input type="number" step="1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.maximumInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, maximumInterval: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Starting ease</label>
                    <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.startingEase} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, startingEase: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Easy bonus</label>
                    <input type="number" step="0.05" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.easyBonus} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, easyBonus: val})) } }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Interval modifier</label>
                    <input type="number" step="0.05" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                      value={deckSettingsForm.intervalModifier} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, intervalModifier: val})) } }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Hard interval</label>
                      <input type="number" step="0.05" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                        value={deckSettingsForm.hardInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, hardInterval: val})) } }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">New interval</label>
                      <input type="number" step="0.05" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                        value={deckSettingsForm.newInterval} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, newInterval: val})) } }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Display Order */}
              <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Display Order</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">New card gather order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.newCardGatherOrder} onChange={e => setDeckSettingsForm(p => ({...p, newCardGatherOrder: e.target.value}))}>
                      <option value="Deck">Deck</option>
                      <option value="Random">Random</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">New card sort order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.newCardSortOrder} onChange={e => setDeckSettingsForm(p => ({...p, newCardSortOrder: e.target.value}))}>
                      <option value="Card type, then order gathered">Card type, then order gathered</option>
                      <option value="Random">Random</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">New/review order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.newReviewOrder} onChange={e => setDeckSettingsForm(p => ({...p, newReviewOrder: e.target.value}))}>
                      <option value="Mix with reviews">Mix with reviews</option>
                      <option value="Show after reviews">Show after reviews</option>
                      <option value="Show before reviews">Show before reviews</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Interday learning/review order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.interdayLearningReviewOrder} onChange={e => setDeckSettingsForm(p => ({...p, interdayLearningReviewOrder: e.target.value}))}>
                      <option value="Mix with reviews">Mix with reviews</option>
                      <option value="Show after reviews">Show after reviews</option>
                      <option value="Show before reviews">Show before reviews</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--nv-muted)] font-bold">Review sort order</label>
                    <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                      value={deckSettingsForm.reviewSortOrder} onChange={e => setDeckSettingsForm(p => ({...p, reviewSortOrder: e.target.value}))}>
                      <option value="Due date, then random">Due date, then random</option>
                      <option value="Random">Random</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Timers & Audio */}
              <div className="flex flex-col gap-8">
                <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                  <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Timers</h4>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Maximum answer seconds</label>
                      <input type="number" step="1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                        value={deckSettingsForm.maximumAnswerSeconds} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, maximumAnswerSeconds: val})) } }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Show on-screen timer</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.showOnScreenTimer} onChange={e => setDeckSettingsForm(p => ({...p, showOnScreenTimer: e.target.checked}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Stop on-screen timer on answer</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.stopTimerOnAnswer} onChange={e => setDeckSettingsForm(p => ({...p, stopTimerOnAnswer: e.target.checked}))} />
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                  <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Audio</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Don't play audio automatically</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.dontPlayAudioAutomatically} onChange={e => setDeckSettingsForm(p => ({...p, dontPlayAudioAutomatically: e.target.checked}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Skip question when replaying answer</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.skipQuestionWhenReplayingAnswer} onChange={e => setDeckSettingsForm(p => ({...p, skipQuestionWhenReplayingAnswer: e.target.checked}))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Burying & Auto Advance */}
              <div className="flex flex-col gap-8">
                <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                  <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Burying</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Bury new siblings</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.buryNewSiblings} onChange={e => setDeckSettingsForm(p => ({...p, buryNewSiblings: e.target.checked}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Bury review siblings</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.buryReviewSiblings} onChange={e => setDeckSettingsForm(p => ({...p, buryReviewSiblings: e.target.checked}))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Bury interday learning siblings</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.buryInterdayLearningSiblings} onChange={e => setDeckSettingsForm(p => ({...p, buryInterdayLearningSiblings: e.target.checked}))} />
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--nv-bg)] border border-[var(--nv-border)] p-5 rounded-lg">
                  <h4 className="text-[0.6rem] uppercase tracking-widest text-[var(--nv-muted)] font-bold mb-4">Auto Advance</h4>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Seconds to show question for</label>
                      <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                        value={deckSettingsForm.secondsToShowQuestion} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, secondsToShowQuestion: val})) } }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Seconds to show answer for</label>
                      <input type="number" step="0.1" className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white font-mono text-sm outline-none focus:border-[var(--nv-primary)] w-full"
                        value={deckSettingsForm.secondsToShowAnswer} onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) { setDeckSettingsForm(p => ({...p, secondsToShowAnswer: val})) } }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Question action</label>
                      <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                        value={deckSettingsForm.questionAction} onChange={e => setDeckSettingsForm(p => ({...p, questionAction: e.target.value}))}>
                        <option value="Show Answer">Show Answer</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Answer action</label>
                      <select className="bg-[var(--nv-surface)] border border-[var(--nv-border)] rounded px-3 py-2 text-white outline-none focus:border-[var(--nv-primary)] w-full text-xs"
                        value={deckSettingsForm.answerAction} onChange={e => setDeckSettingsForm(p => ({...p, answerAction: e.target.value}))}>
                        <option value="Bury Card">Bury Card</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[var(--nv-muted)] font-bold">Wait for audio</label>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--nv-primary)]" checked={deckSettingsForm.waitForAudio} onChange={e => setDeckSettingsForm(p => ({...p, waitForAudio: e.target.checked}))} />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 shrink-0 pt-2">
              <button type="button" onClick={() => setShowSettings(false)} className="px-5 py-2 text-[var(--nv-muted)] hover:text-white transition-colors text-sm font-bold">Cancel</button>
              <button type="submit" className="rounded-lg border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-5 py-2 text-sm font-bold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary)] hover:text-[var(--nv-foreground)]">Save Settings</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
