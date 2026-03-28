import { Link, useLocation } from 'react-router-dom'
import { SettingsModal } from '../settings-modal'
import { useState } from 'react'
import { LoaderCircle, LogOut, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
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
            <button
              onClick={() => setIsSyncOpen(true)}
              className="text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-secondary)]"
              title="Sync Netherite"
            >
              {isSyncing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            </button>
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
