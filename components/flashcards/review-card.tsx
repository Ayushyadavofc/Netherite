"use client"

import { useState } from "react"
import { RotateCcw, Eye, EyeOff } from "lucide-react"

interface ReviewCardProps {
  question: string
  answer: string
  currentCard: number
  totalCards: number
  onResponse: (response: "again" | "hard" | "good" | "easy") => void
}

export function ReviewCard({
  question,
  answer,
  currentCard,
  totalCards,
  onResponse,
}: ReviewCardProps) {
  const [showAnswer, setShowAnswer] = useState(false)

  const handleResponse = (response: "again" | "hard" | "good" | "easy") => {
    setShowAnswer(false)
    onResponse(response)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-zinc-500">
          Card {currentCard} of {totalCards}
        </span>
        <div className="flex-1 mx-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${(currentCard / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {/* Question */}
        <div className="p-8 border-b border-zinc-800">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
            Question
          </p>
          <p className="text-xl text-zinc-100 leading-relaxed">{question}</p>
        </div>

        {/* Answer */}
        <div className="p-8 bg-zinc-900/50 min-h-[150px]">
          {showAnswer ? (
            <>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
                Answer
              </p>
              <p className="text-lg text-zinc-300 leading-relaxed">{answer}</p>
            </>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full flex items-center justify-center gap-2 py-8 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Eye className="w-5 h-5" />
              <span>Show Answer</span>
            </button>
          )}
        </div>

        {/* Response Buttons */}
        {showAnswer && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900">
            <div className="grid grid-cols-4 gap-2">
              <ResponseButton
                label="Again"
                sublabel="< 1m"
                color="rose"
                onClick={() => handleResponse("again")}
              />
              <ResponseButton
                label="Hard"
                sublabel="6m"
                color="orange"
                onClick={() => handleResponse("hard")}
              />
              <ResponseButton
                label="Good"
                sublabel="10m"
                color="blue"
                onClick={() => handleResponse("good")}
              />
              <ResponseButton
                label="Easy"
                sublabel="4d"
                color="emerald"
                onClick={() => handleResponse("easy")}
              />
            </div>
          </div>
        )}
      </div>

      {/* Flip hint */}
      <p className="text-center text-xs text-zinc-600 mt-4">
        Press Space to {showAnswer ? "select Good" : "show answer"}
      </p>
    </div>
  )
}

function ResponseButton({
  label,
  sublabel,
  color,
  onClick,
}: {
  label: string
  sublabel: string
  color: "rose" | "orange" | "blue" | "emerald"
  onClick: () => void
}) {
  const colorClasses = {
    rose: "hover:bg-rose-500/10 hover:border-rose-500/50 hover:text-rose-400",
    orange:
      "hover:bg-orange-500/10 hover:border-orange-500/50 hover:text-orange-400",
    blue: "hover:bg-blue-500/10 hover:border-blue-500/50 hover:text-blue-400",
    emerald:
      "hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400",
  }

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-3 rounded-lg border border-zinc-800 bg-zinc-800/50 text-zinc-300 transition-colors ${colorClasses[color]}`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-zinc-500">{sublabel}</span>
    </button>
  )
}
