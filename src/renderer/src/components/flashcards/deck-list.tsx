import { Play, MoreHorizontal, AlertCircle } from "lucide-react"

export interface Deck {
  id: string
  name: string
  total: number
  dueToday: number
  newCards: number
  lastStudied: string
  isOverdue: boolean
}

interface DeckListProps {
  decks: Deck[]
  onStudyDeck: (deckId: string) => void
}

export function DeckList({ decks, onStudyDeck }: DeckListProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {decks.map((deck) => (
        <DeckCard key={deck.id} deck={deck} onStudy={() => onStudyDeck(deck.id)} />
      ))}
    </div>
  )
}

function DeckCard({ deck, onStudy }: { deck: Deck; onStudy: () => void }) {
  return (
    <div className={`flex flex-col rounded-[8px] border bg-[var(--nv-surface)] p-6 transition-colors ${deck.isOverdue ? 'border-[var(--nv-danger)]' : 'border-[var(--nv-border)]'}`}>
      <div className="mb-6 flex items-start justify-between">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-lg font-bold text-white truncate">
            {deck.name}
          </h3>
          <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-[var(--nv-subtle)]">{deck.total} cards total</p>
        </div>
        <button className="p-1 text-[var(--nv-subtle)] transition-colors hover:text-[var(--nv-primary)]">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 relative">
            <span className="text-2xl font-bold text-[var(--nv-primary)]">
              {deck.dueToday}
            </span>
            {deck.isOverdue && (
               <div className="absolute -right-3 top-2 h-2 w-2 rounded-full bg-[var(--nv-danger)]" />
            )}
          </div>
          <p className="text-xs text-[var(--nv-subtle)]">
            {deck.isOverdue ? "Overdue" : "Due today"}
          </p>
        </div>
        <div className="flex flex-col">
          <span className="mt-auto text-sm font-semibold text-[var(--nv-muted)]">
            {deck.newCards}
          </span>
          <p className="text-xs text-[var(--nv-subtle)]">New</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--nv-border)] pt-6">
        <span className="text-xs text-[var(--nv-subtle)]">
          Last studied: {deck.lastStudied}
        </span>
        <button
          onClick={onStudy}
          className="flex items-center gap-2 rounded-[4px] border border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-4 py-2 text-sm font-medium text-[var(--nv-primary)] transition-all hover:bg-[var(--nv-primary-soft-strong)] hover:shadow-[0_0_12px_var(--nv-primary-glow)]"
        >
          Study
        </button>
      </div>
    </div>
  )
}
