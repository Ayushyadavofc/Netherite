// AI Flashcard Generation Service
// Offloads generation to the main process to avoid renderer CSP blocking.

export interface Note {
  name: string
  content: string
}

export interface Flashcard {
  front: string
  back: string
}

/**
 * Generates flashcards from an array of notes using the Groq chat completions API.
 * Delegates the heavy lifting and API call to the main process via IPC.
 */
export async function generateFlashcards(
  notes: Note[],
  apiKey: string
): Promise<Flashcard[]> {
  if (notes.length === 0) return []
  return await window.electronAPI.generateFlashcards(notes, apiKey)
}

/**
 * Returns a rough estimate of how many flashcards will be generated.
 * Assumes ~3 cards per note.
 */
export function estimateCardCount(notes: Note[]): number {
  return notes.length * 3
}
