import { Link, useLocation } from 'react-router-dom'
import { SettingsModal } from '../settings-modal'
import { useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

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

  return (
    <>
      <header 
        className="w-full shrink-0 z-50 bg-[#0a0808] border-b border-[#2a2422] flex justify-between items-center h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-8 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-[#ff5625] text-lg">&#x2B21;</span>
            <span className="text-white font-semibold text-sm">Netherite</span>
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
                      ? 'font-bold text-[#ff5625] bg-[rgba(255,86,37,0.1)]'
                      : 'font-medium text-[#a8a0a0] hover:text-[#ffffff] hover:bg-[#111111]'
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
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="text-[#a8a0a0] hover:text-[#ffffff] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          <Link
            to="/"
            className="text-[#a8a0a0] hover:text-[#ffb77d] transition-colors"
            title="Exit Vault"
          >
            <span className="material-symbols-outlined text-[20px]">exit_to_app</span>
          </Link>
          </div>
          <div className="flex items-center h-full">
            <button onClick={() => window.electronAPI.minimize()} className="p-2 h-full px-4 text-zinc-500 hover:text-zinc-200 hover:bg-[#111111] transition-colors">
              <Minus className="w-4 h-4" />
            </button>
            <button onClick={() => window.electronAPI.maximize()} className="p-2 h-full px-4 text-zinc-500 hover:text-zinc-200 hover:bg-[#111111] transition-colors">
              <Square className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => window.electronAPI.close()} className="p-2 h-full px-4 text-zinc-500 hover:text-[#ff5449] hover:bg-[rgba(255,84,73,0.1)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </>
  )
}
