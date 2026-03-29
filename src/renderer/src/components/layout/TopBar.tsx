import { Link, useLocation } from 'react-router-dom'
import { SettingsModal } from '../settings-modal'
import { useState } from 'react'
import { LogOut, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
import { SyncModal } from '@/components/SyncModal'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/notes', label: 'Notes' },
  { href: '/flashcards', label: 'Flashcards' },
  { href: '/habits', label: 'Habits' },
  { href: '/todos', label: 'To-Do' }
]

export function TopBar() {
  const location = useLocation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isSyncing = useSyncStore((state) => state.isSyncing)
  const syncStatus = useSyncStore((state) => state.syncStatus)
  const progress = useSyncStore((state) => state.progress)
  const progressDetails = useSyncStore((state) => state.progressDetails)

  const formatMegabytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  }

  return (
    <>
      <header 
        className="flex h-12 w-full shrink-0 items-center justify-between border-b border-[var(--nv-border)] bg-[var(--nv-bg)] text-[var(--nv-foreground)] z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-8 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-lg text-[var(--nv-primary)]">&#x2B21;</span>
            <span className="text-sm font-semibold text-[var(--nv-foreground)]">Netherite</span>
          </div>
          <nav className="hidden md:flex gap-8 items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`px-3 py-2 rounded-lg text-sm tracking-widest uppercase transition-all ${
                    isActive
                      ? 'bg-[var(--nv-primary-soft)] font-bold text-[var(--nv-primary)]'
                      : 'font-medium text-[var(--nv-muted)] hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex flex-row items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-6 pr-6">
          {isAuthenticated && (
            <div className="group relative">
              <button
                onClick={() => setIsSyncOpen(true)}
                className={`relative top-px inline-flex h-5 w-5 items-center justify-center text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-secondary)] ${
                  isSyncing ? 'text-[var(--nv-secondary)]' : ''
                }`}
                title={isSyncing ? 'Syncing... click to open progress' : 'Sync Netherite'}
              >
                <RefreshCw className={`h-[17px] w-[17px] ${isSyncing ? 'animate-spin' : ''}`} />
              </button>

              {isSyncing && (
                <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.35)] group-hover:block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-[var(--nv-secondary)]">
                      {syncStatus === 'uploading' ? 'Syncing' : 'Restoring'}
                    </span>
                    {progressDetails ? (
                      <span className="text-xs text-[var(--nv-subtle)]">
                        {Math.round(progressDetails.percent)}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-[var(--nv-muted)]">
                    {progress || 'Sync in progress...'}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--nv-surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--nv-primary)] transition-[width] duration-200"
                      style={{ width: `${progressDetails?.percent ?? 28}%` }}
                    />
                  </div>
                  {progressDetails ? (
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--nv-subtle)]">
                      <span>
                        {formatMegabytes(progressDetails.currentBytes)} / {formatMegabytes(progressDetails.totalBytes)}
                      </span>
                      <span>Click to reopen</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-[var(--nv-subtle)]">Click to reopen</div>
                  )}
                </div>
              )}
            </div>
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-foreground)]"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <Link
            to="/"
            className="text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-secondary)]"
            title="Exit Vault"
          >
            <LogOut className="h-5 w-5" />
          </Link>
          </div>
          <div className="flex items-center h-full">
            <button onClick={() => window.electronAPI.minimize()} className="h-full px-4 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]">
              <Minus className="w-4 h-4" />
            </button>
            <button onClick={() => window.electronAPI.maximize()} className="h-full px-4 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]">
              <Square className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => window.electronAPI.close()} className="h-full px-4 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
      />
    </>
  )
}
