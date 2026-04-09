import { Link, useLocation } from 'react-router-dom'
import { SettingsModal } from '../settings-modal'
import { useState } from 'react'
import appIcon from '../../../../../app-icon.png'
import {
  BarChart3,
  CheckSquare,
  Flame,
  LayoutDashboard,
  LogOut,
  Minus,
  NotebookPen,
  RefreshCw,
  Settings,
  Shirt,
  ShoppingCart,
  Square,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SyncModal } from '@/components/SyncModal'
import { StackedCardsIcon } from '@/components/ui/StackedCardsIcon'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/flashcards', label: 'Flashcards', icon: StackedCardsIcon },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/todos', label: 'To-Do', icon: CheckSquare },
  { href: '/store', label: 'Store', icon: ShoppingCart },
  { href: '/inventory', label: 'Inventory', icon: Shirt },
  { href: '/analytics', label: 'AI Analytics', icon: BarChart3 }
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: LucideIcon | ((props: { className?: string }) => JSX.Element) }>

const NAV_PILL_TRANSITION_MS = 180

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
            <img src={appIcon} alt="Netherite" className="h-5 w-5 object-contain" />
            <span className="text-sm font-semibold text-[var(--nv-foreground)]">Netherite</span>
          </div>
          <nav className="hidden md:flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  title={isActive ? undefined : item.label}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border px-3 transition-[width,height,background-color,border-color,color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                    isActive
                      ? 'w-32 border-[var(--nv-primary)]/60 bg-[var(--nv-primary)] text-[var(--nv-primary-contrast)]'
                      : 'w-9 border-transparent bg-transparent text-[var(--nv-muted)] hover:bg-transparent hover:text-[var(--nv-foreground)] hover:shadow-none'
                  }`}
                  style={
                    isActive
                      ? {
                          boxShadow: '0 0 0 1px rgba(255,255,255,0.04) inset, 0 8px 20px var(--nv-primary-glow)'
                        }
                      : undefined
                  }
                >
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2"
                    style={{
                      willChange: 'opacity, transform'
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span
                      className="overflow-hidden whitespace-nowrap text-[0.66rem] font-semibold uppercase tracking-[0.14em]"
                      style={{
                        maxWidth: isActive ? '92px' : '0px',
                        opacity: isActive ? 1 : 0,
                        transform: `translate3d(${isActive ? '0' : '-6px'}, 0, 0)`,
                        transition: `max-width ${NAV_PILL_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease-out, transform ${NAV_PILL_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
                      }}
                    >
                      {item.label}
                    </span>
                  </span>
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
