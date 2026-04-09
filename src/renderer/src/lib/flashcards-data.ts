export interface FlashcardDeckSummary {
  id: string
  name: string
  fileName: string
  total: number
  dueToday: number
  newCards: number
  lastStudied: string
  isOverdue: boolean
}

export const FLASHCARDS_DATA_EVENT = 'flashcards-data-changed'

export const emitFlashcardsDataChange = () => {
  window.dispatchEvent(new Event(FLASHCARDS_DATA_EVENT))
}

const isInsideVault = (filePath: string, vaultPath: string): boolean => {
  const normalizeForCompare = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const resolved = normalizeForCompare(filePath)
  const vaultResolved = normalizeForCompare(vaultPath)
  return resolved.startsWith(`${vaultResolved}/`)
}

function parseDeckFile(content: string, fileName: string): FlashcardDeckSummary {
  const name = fileName.replace(/\.md$/, '').split('/').pop() || fileName
  const deck: FlashcardDeckSummary = {
    id: fileName,
    name,
    fileName,
    total: 0,
    dueToday: 0,
    newCards: 0,
    lastStudied: 'Never',
    isOverdue: false
  }

  const blocks = content.split(/^---$/m)

  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index].trim()
    if (!block) continue

    const match = block.match(/^Q:\s*([\s\S]*?)^\s*A:\s*([\s\S]*?)(?:^\s*<!-- SM2:\s*(\{.*?\})\s*-->|$)/m)
    if (!match) continue

    deck.total += 1

    let reps = 0
    let nextReview = 0

    if (match[3]) {
      try {
        const parsed = JSON.parse(match[3]) as { reps?: number; nextReview?: number }
        reps = typeof parsed.reps === 'number' ? parsed.reps : 0
        nextReview = typeof parsed.nextReview === 'number' ? parsed.nextReview : 0
      } catch {
        reps = 0
        nextReview = 0
      }
    }

    if (reps === 0) {
      deck.newCards += 1
    } else if (nextReview <= Date.now()) {
      deck.dueToday += 1
    }
  }

  deck.isOverdue = deck.dueToday > 0
  return deck
}

export async function loadFlashcardDeckSummaries(): Promise<FlashcardDeckSummary[]> {
  const vaultPath = localStorage.getItem('netherite-current-vault-path')
  if (!vaultPath) return []

  const flashcardsDir = `${vaultPath}/flashcards`
  try {
    await window.electronAPI.createFolder(flashcardsDir)
  } catch {
    // Ignore create-folder failures and continue reading what already exists.
  }

  try {
    const files = await window.electronAPI.readFolder(flashcardsDir, { includeMarkdownContent: true })
    const deckFiles = files.filter((entry: any) => entry.type === 'file' && entry.name.endsWith('.md'))
    const loadedDecks: FlashcardDeckSummary[] = []

    for (const entry of deckFiles) {
      if (entry.content) {
        loadedDecks.push(parseDeckFile(entry.content, entry.name))
        continue
      }

      try {
        const content = await window.electronAPI.readFile(`${flashcardsDir}/${entry.name}`)
        loadedDecks.push(parseDeckFile(content, entry.name))
      } catch {
        // Skip unreadable deck files instead of failing the whole view.
      }
    }

    const externalRefsPath = `${flashcardsDir}/externalDecks.json`
    let externalPaths: string[] = []

    try {
      if (await window.electronAPI.fileExists(externalRefsPath)) {
        const content = await window.electronAPI.readFile(externalRefsPath)
        const parsed = JSON.parse(content)
        externalPaths = Array.isArray(parsed) ? parsed : []
      } else {
        await window.electronAPI.writeFile(externalRefsPath, '[]')
      }
    } catch {
      externalPaths = []
    }

    for (const deckPath of externalPaths) {
      if (!isInsideVault(deckPath, vaultPath)) {
        continue
      }

      try {
        const content = await window.electronAPI.readFile(deckPath)
        loadedDecks.push(parseDeckFile(content, deckPath))
      } catch {
        // Ignore missing linked decks so the rest of the dashboard still loads.
      }
    }

    return loadedDecks.sort((left, right) => {
      if (right.dueToday !== left.dueToday) return right.dueToday - left.dueToday
      if (right.newCards !== left.newCards) return right.newCards - left.newCards
      return left.name.localeCompare(right.name)
    })
  } catch (error) {
    console.error('Failed to load flashcard deck summaries:', error)
    return []
  }
}
