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
    <div className={`rounded-[8px] border bg-[#111111] p-6 flex flex-col transition-colors ${deck.isOverdue ? 'border-[#7f1d1d]' : 'border-[#1f1d1d]'}`}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="text-lg font-bold text-white truncate">
            {deck.name}
          </h3>
          <p className="text-[0.6rem] text-[#444444] uppercase font-bold tracking-[0.1em] mt-1">{deck.total} cards total</p>
        </div>
        <button className="text-[#666666] hover:text-[#ff7043] transition-colors p-1">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-6 mb-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 relative">
            <span className="text-2xl font-bold text-[#ff7043]">
              {deck.dueToday}
            </span>
            {deck.isOverdue && (
               <div className="w-2 h-2 rounded-full bg-[#7f1d1d] absolute -right-3 top-2" />
            )}
          </div>
          <p className="text-[#666666] text-xs">
            {deck.isOverdue ? "Overdue" : "Due today"}
          </p>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#666666] mt-auto">
            {deck.newCards}
          </span>
          <p className="text-[#444444] text-xs">New</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-[#1f1d1d] mt-auto">
        <span className="text-xs text-[#444444]">
          Last studied: {deck.lastStudied}
        </span>
        <button
          onClick={onStudy}
          className="flex items-center gap-2 px-4 py-2 bg-[rgba(255,69,0,0.15)] border border-[#FF4500] text-[#ff7043] rounded-[4px] font-medium text-sm hover:bg-[rgba(255,69,0,0.25)] hover:shadow-[0_0_12px_rgba(255,69,0,0.3)] transition-all"
        >
          Study
        </button>
      </div>
    </div>
  )
}
