import { Minus, Square, X } from 'lucide-react'
import appIcon from '../../../../app-icon.png'

export default function TitleBar({ minimal = false }: { minimal?: boolean }) {
  return (
    <div
      className="flex select-none items-center justify-between border-b border-[var(--nv-border)] bg-[color:var(--nv-bg)]/95 px-4 py-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        {!minimal && (
          <>
            <img src={appIcon} alt="Netherite" className="h-5 w-5 object-contain" />
            <span className="text-sm font-semibold text-[var(--nv-foreground)]">Netherite</span>
          </>
        )}
      </div>
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => window.electronAPI.minimize()} className="rounded-md p-2 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => window.electronAPI.maximize()} className="rounded-md p-2 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]">
          <Square className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => window.electronAPI.close()} className="rounded-md p-2 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
