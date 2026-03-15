"use client"

import { useState } from "react"
import Link from "next/link"
import { Home, FileText, LogOut, ChevronLeft } from "lucide-react"
import { StatsOverview } from "@/components/flashcards/stats-overview"
import { DeckList, type Deck } from "@/components/flashcards/deck-list"
import { ReviewCard } from "@/components/flashcards/review-card"

const mockDecks: Deck[] = [
  {
    id: "1",
    name: "DSA Concepts",
    total: 120,
    dueToday: 8,
    newCards: 3,
    lastStudied: "2 hours ago",
    isOverdue: false,
  },
  {
    id: "2",
    name: "OS Notes",
    total: 80,
    dueToday: 12,
    newCards: 5,
    lastStudied: "Yesterday",
    isOverdue: true,
  },
  {
    id: "3",
    name: "Netherite Arch",
    total: 40,
    dueToday: 4,
    newCards: 0,
    lastStudied: "3 days ago",
    isOverdue: false,
  },
]

const mockCards = [
  {
    question: "What is the time complexity of binary search?",
    answer:
      "O(log n) - The search space is halved with each comparison, resulting in logarithmic time complexity.",
  },
  {
    question: "Explain the difference between a stack and a queue.",
    answer:
      "Stack follows LIFO (Last In, First Out) while Queue follows FIFO (First In, First Out). Think of a stack of plates vs a line at a store.",
  },
  {
    question: "What is memoization in dynamic programming?",
    answer:
      "Memoization is an optimization technique that stores results of expensive function calls and returns the cached result when the same inputs occur again.",
  },
]

export default function FlashcardsPage() {
  const [isStudying, setIsStudying] = useState(false)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)

  const handleStudyDeck = (deckId: string) => {
    setActiveDeckId(deckId)
    setIsStudying(true)
    setCurrentCardIndex(0)
  }

  const handleResponse = (response: "again" | "hard" | "good" | "easy") => {
    console.log(`Response: ${response}`)
    if (currentCardIndex < mockCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1)
    } else {
      setIsStudying(false)
      setActiveDeckId(null)
      setCurrentCardIndex(0)
    }
  }

  const currentCard = mockCards[currentCardIndex]

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-amber-500 text-xl">&#x2B21;</span>
              <span className="text-amber-500 font-semibold">Flashcards</span>
            </div>
            <nav className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="text-sm">Dashboard</span>
              </Link>
              <Link
                href="/notes"
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm">Notes</span>
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Exit</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Stats Overview */}
          <StatsOverview
            todayReview={24}
            newCards={8}
            learningCards={6}
            dueCards={10}
            totalCards={340}
            mastered={180}
            streak={12}
          />

          {/* Deck List */}
          {!isStudying && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-100">
                Your Decks
              </h2>
              <DeckList decks={mockDecks} onStudyDeck={handleStudyDeck} />
            </section>
          )}

          {/* Active Review Card */}
          {isStudying && currentCard && (
            <section className="pt-4">
              <div className="mb-6 flex items-center justify-between">
                <button
                  onClick={() => {
                    setIsStudying(false)
                    setActiveDeckId(null)
                  }}
                  className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-sm">Back to Decks</span>
                </button>
                <button
                  onClick={() => {
                    setIsStudying(false)
                    setActiveDeckId(null)
                  }}
                  className="text-sm text-zinc-500 hover:text-zinc-300"
                >
                  End Session
                </button>
              </div>
              <ReviewCard
                question={currentCard.question}
                answer={currentCard.answer}
                currentCard={currentCardIndex + 1}
                totalCards={mockCards.length}
                onResponse={handleResponse}
              />
            </section>
          )}

          {/* Prompt to start studying if not active */}
          {!isStudying && (
            <section className="pt-4">
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-12 text-center">
                <h3 className="mb-2 text-lg font-medium text-zinc-100">
                  Ready to study?
                </h3>
                <p className="text-zinc-500">
                  Select a deck above to start your review session
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
