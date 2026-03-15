"use client"

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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-zinc-100 truncate">
            {deck.name}
          </h3>
          <p className="text-sm text-zinc-500">{deck.total} cards total</p>
        </div>
        <button className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-bold text-amber-500">
              {deck.dueToday}
            </span>
            {deck.isOverdue && (
              <AlertCircle className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {deck.isOverdue ? "Overdue" : "Due today"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-blue-500">
            {deck.newCards}
          </span>
          <p className="text-xs text-zinc-500">New</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">
          Last studied: {deck.lastStudied}
        </span>
        <button
          onClick={onStudy}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-zinc-950 rounded-lg font-medium text-sm hover:bg-amber-400 transition-colors"
        >
          <Play className="w-4 h-4" />
          Study
        </button>
      </div>
    </div>
  )
}
