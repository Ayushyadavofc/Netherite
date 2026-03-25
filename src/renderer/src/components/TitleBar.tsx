import { Minus, Square, X } from 'lucide-react'

export default function TitleBar({ minimal = false }: { minimal?: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-[#1e1e1e] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        {!minimal && (
          <>
            <span className="text-primary text-lg">&#x2B21;</span>
            <span className="text-primary font-semibold text-sm">Netherite</span>
          </>
        )}
      </div>
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => window.electronAPI.minimize()} className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-[#0f0f0f] transition-colors">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => window.electronAPI.maximize()} className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-[#0f0f0f] transition-colors">
          <Square className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => window.electronAPI.close()} className="p-2 text-zinc-500 hover:text-primary hover:bg-[#0f0f0f] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
