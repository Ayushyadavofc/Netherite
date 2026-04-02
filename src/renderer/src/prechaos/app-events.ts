export type PreChaosAppEventDetail = {
  source: 'notes' | 'flashcards' | 'todos' | 'habits'
  action:
    | 'note_opened'
    | 'note_keystroke'
    | 'note_saved'
    | 'note_created'
    | 'folder_created'
    | 'flashcard_review'
    | 'flashcard_success'
    | 'flashcard_session_started'
    | 'flashcard_session_ended'
    | 'flashcard_deck_opened'
    | 'deck_created'
    | 'card_created'
    | 'todo_completed'
    | 'todo_created'
    | 'todo_updated'
    | 'todo_viewed'
    | 'habit_checked'
    | 'habit_created'
    | 'habit_updated'
    | 'habit_viewed'
  label: string
  importance?: 'low' | 'medium' | 'high'
  metadata?: Record<string, unknown>
}

export const PRECHAOS_APP_EVENT = 'prechaos-app-event'

export function emitPreChaosAppEvent(detail: PreChaosAppEventDetail) {
  window.dispatchEvent(new CustomEvent<PreChaosAppEventDetail>(PRECHAOS_APP_EVENT, { detail }))
}
