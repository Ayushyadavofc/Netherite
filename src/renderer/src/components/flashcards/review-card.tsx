import { useState, useEffect } from "react"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import type { AttachmentItem } from "@/lib/attachments"

interface ReviewCardProps {
  question: string
  answer: string
  attachmentItems?: AttachmentItem[]
  currentCard: number
  totalCards: number
  onResponse: (response: "again" | "hard" | "good" | "easy") => void
  streak?: number
  sm2Intervals?: { again: string, hard: string, good: string, easy: string }
  settings?: any
}

export function ReviewCard({
  question,
  answer,
  attachmentItems = [],
  currentCard,
  totalCards,
  onResponse,
  streak = 14,
  sm2Intervals,
  settings
}: ReviewCardProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [timer, setTimer] = useState(0)

  useEffect(() => {
    setShowAnswer(false)
    setTimer(0)
  }, [question])

  useEffect(() => {
    if (!settings?.showOnScreenTimer) return
    if (settings?.stopTimerOnAnswer && showAnswer) return

    const maxSeconds = settings?.maximumAnswerSeconds || 60
    const interval = setInterval(() => {
      setTimer(t => {
        if (t >= maxSeconds) {
          clearInterval(interval)
          return t
        }
        return t + 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [question, showAnswer, settings])

  const maxSeconds = settings?.maximumAnswerSeconds || 60
  const isTimedOut = timer >= maxSeconds

  // Listen for space key to flip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !showAnswer) {
        e.preventDefault()
        setShowAnswer(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAnswer])

  const handleResponse = (response: "again" | "hard" | "good" | "easy") => {
    setShowAnswer(false)
    onResponse(response)
  }

  return (
    <div className="flex-grow flex flex-col items-center justify-center w-full z-10 px-6 py-12 h-full">
      {/* Breadcrumbs / Session Label */}
      <div className="mb-12 text-center mt-[-6rem] flex flex-col items-center justify-center gap-1">
        <span className="text-[0.6rem] uppercase tracking-[0.4em] text-[#a8a0a0]/40 font-bold">ACTIVE PROTOCOL</span>
        {settings?.showOnScreenTimer && (
          <div className={`text-xl font-mono font-bold mt-2 ${isTimedOut ? 'text-[#ff5449]' : 'text-[#ffb77d]'}`}>
            {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Flashcard Container */}
      <div className="relative w-full max-w-2xl aspect-[16/10]">
        {/* Main Flashcard */}
        <div className="absolute inset-0 bg-[#0a0808] rounded-lg border border-[#2a2422] flex flex-col overflow-y-auto custom-scrollbar">
          
          {/* Question Content */}
          <div className="relative z-10 flex flex-col items-center justify-start gap-8 min-h-full w-full p-12 pt-16">
            <span className="text-[#ff5625] text-[0.6rem] px-3 py-1 border border-[#ff5625]/30 rounded uppercase tracking-[0.3em] font-bold absolute top-6">Critical</span>
            
            <div className="text-3xl md:text-3xl font-headline font-bold tracking-tight leading-loose text-white px-8 w-full break-words my-auto flex flex-col items-center justify-center">
              <MarkdownContent content={question} attachmentItems={attachmentItems} className="w-full text-white" />
            </div>

            {showAnswer && (
              <div className="mt-8 pt-6 border-t border-[#2a2422] w-full flex flex-col items-center justify-center animate-in fade-in duration-300 pb-12">
                <div className="text-lg text-white text-center px-4 font-headline w-full break-words">
                  <MarkdownContent content={answer} attachmentItems={attachmentItems} className="w-full text-white" />
                </div>
              </div>
            )}
          </div>

          {/* Flip Button */}
          {!showAnswer && (
            <div className="sticky bottom-0 left-0 w-full pt-8 pb-6 bg-gradient-to-t from-[#0a0808] via-[#0a0808]/80 to-transparent flex justify-center mt-auto">
              <button 
                onClick={() => setShowAnswer(true)}
                className="flex flex-col items-center gap-2 group cursor-pointer"
              >
                <div className="w-10 h-10 rounded border border-[#2a2422] flex items-center justify-center text-[#a8a0a0] group-hover:text-[#ff5625] group-hover:border-[#ff5625] transition-all duration-200">
                  <span className="material-symbols-outlined text-lg" data-icon="sync">sync</span>
                </div>
                <span className="text-[0.55rem] uppercase tracking-[0.2em] font-bold text-[#a8a0a0]/30 group-hover:text-[#ff5625] transition-colors">Flip Card</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SM-2 Interaction Bar */}
      <div className={`mt-16 w-full max-w-3xl transition-opacity duration-300 ${showAnswer ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button onClick={() => handleResponse("again")} className="group flex flex-col items-center gap-2 p-5 bg-[#0a0808] border border-[#2a2422] hover:border-[#ff5449] transition-all rounded cursor-pointer">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-[#ff5449]/60 group-hover:text-[#ff5449]">Again</span>
            <span className="text-[0.55rem] text-[#a8a0a0]/30 font-bold tracking-widest">{sm2Intervals?.again || '< 1m'}</span>
          </button>
          <button onClick={() => handleResponse("hard")} className="group flex flex-col items-center gap-2 p-5 bg-[#0a0808] border border-[#2a2422] hover:border-white transition-all rounded cursor-pointer">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-[#a8a0a0] group-hover:text-white">Hard</span>
            <span className="text-[0.55rem] text-[#a8a0a0]/30 font-bold tracking-widest">{sm2Intervals?.hard || '2d'}</span>
          </button>
          <button onClick={() => handleResponse("good")} className="group flex flex-col items-center gap-2 p-5 bg-[#0a0808] border border-[#2a2422] hover:border-[#ff5625] transition-all rounded cursor-pointer">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-[#ff5625]/60 group-hover:text-[#ff5625]">Good</span>
            <span className="text-[0.55rem] text-[#a8a0a0]/30 font-bold tracking-widest">{sm2Intervals?.good || '4d'}</span>
          </button>
          <button onClick={() => handleResponse("easy")} className="group flex flex-col items-center gap-2 p-5 bg-[#0a0808] border border-[#2a2422] hover:border-[#ffb77d] transition-all rounded cursor-pointer">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] font-bold text-[#ffb77d]/60 group-hover:text-[#ffb77d]">Easy</span>
            <span className="text-[0.55rem] text-[#a8a0a0]/30 font-bold tracking-widest">{sm2Intervals?.easy || '7d'}</span>
          </button>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="mt-12 flex items-center gap-12 text-[0.6rem] uppercase tracking-[0.2em] text-[#a8a0a0]/30 font-bold">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">keyboard_command_key</span>
          <span>Space to flip</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">history</span>
          <span>Streak: {streak} Days</span>
        </div>
      </div>
    </div>
  )
}
