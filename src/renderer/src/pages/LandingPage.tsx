import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, FolderOpen, ChevronRight, X } from 'lucide-react'
import ProfileButton from '@/components/ProfileButton'
import TitleBar from '@/components/TitleBar'

/* ── Types ─────────────────────────────────────────── */

interface VaultFileNode {
  id: string
  type: 'file'
  name: string
  path: string
  content: string
}

interface VaultFolderNode {
  id: string
  type: 'folder'
  name: string
  path: string
  children: VaultNode[]
}

type VaultNode = VaultFileNode | VaultFolderNode

interface Vault {
  id: string
  name: string
  dirPath: string | null
  createdAt: string
  lastOpened: string
  tree: VaultNode[]
}

/* ── Helpers ───────────────────────────────────────── */

function fsNodesToVaultTree(
  nodes: { name: string; type: string; path: string; children?: any[]; content?: string }[]
): VaultNode[] {
  return nodes.map((n) => {
    if (n.type === 'folder') {
      return {
        id: crypto.randomUUID(),
        type: 'folder' as const,
        name: n.name,
        path: n.path,
        children: n.children ? fsNodesToVaultTree(n.children) : []
      }
    }
    return {
      id: crypto.randomUUID(),
      type: 'file' as const,
      name: n.name,
      path: n.path,
      content: n.content ?? ''
    }
  })
}

/* ── Component ─────────────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('netherite-vaults')
    if (saved) {
      try {
        const parsed: Vault[] = JSON.parse(saved)
        let needsMigration = false
        const migrated = parsed.map((v) => {
          if (!v.id) {
            needsMigration = true
            return { ...v, id: crypto.randomUUID(), tree: v.tree ?? [] }
          }
          return v
        })
        if (needsMigration) {
          localStorage.setItem('netherite-vaults', JSON.stringify(migrated))
        }
        setVaults(migrated)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const persistVaults = (updated: Vault[]) => {
    setVaults(updated)
    localStorage.setItem('netherite-vaults', JSON.stringify(updated))
  }

  /* ── Create New Vault ─────────────────────────────── */
  const createVault = async () => {
    if (!newVaultName.trim()) return

    const vaultName = newVaultName.trim()
    const now = new Date().toISOString()
    const vaultId = crypto.randomUUID()

    const welcomeContent = '# Welcome\nThis is your vault.\n\nStart writing your notes here.'

    // Use Electron native folder picker
    const selectedPath = await window.electronAPI.selectFolder()
    if (!selectedPath) return // user cancelled

    // Create vault root + subfolders
    const dirPath = `${selectedPath}/${vaultName}`
    await window.electronAPI.createFolder(dirPath)
    await window.electronAPI.createFolder(`${dirPath}/notes`)
    await window.electronAPI.createFolder(`${dirPath}/flashcards`)
    await window.electronAPI.createFolder(`${dirPath}/settings`)
    await window.electronAPI.writeFile(`${dirPath}/notes/Welcome.md`, welcomeContent)

    const newVault: Vault = {
      id: vaultId,
      name: vaultName,
      dirPath,
      createdAt: now,
      lastOpened: now,
      tree: [
        {
          id: crypto.randomUUID(),
          type: 'folder',
          name: 'notes',
          path: 'notes',
          children: [
            {
              id: crypto.randomUUID(),
              type: 'file',
              name: 'Welcome.md',
              path: 'notes/Welcome.md',
              content: welcomeContent
            }
          ]
        },
        { id: crypto.randomUUID(), type: 'folder', name: 'flashcards', path: 'flashcards', children: [] },
        { id: crypto.randomUUID(), type: 'folder', name: 'settings', path: 'settings', children: [] },
      ]
    }

    const updated = [newVault, ...vaults]
    persistVaults(updated)
    localStorage.setItem('netherite-current-vault', vaultName)
    localStorage.setItem('netherite-current-vault-id', vaultId)
    localStorage.setItem('netherite-current-vault-path', dirPath)

    setShowCreateModal(false)
    setNewVaultName('')
    navigate('/dashboard')
  }

  /* ── Open Vault ───────────────────────────────────── */
  const openVaultFromDisk = async () => {
    const selectedPath = await window.electronAPI.selectFolder()
    if (!selectedPath) return

    const now = new Date().toISOString()
    const vaultName = selectedPath.split('/').pop() || selectedPath.split('\\').pop() || 'Vault'

    const fsNodes = await window.electronAPI.readFolder(selectedPath)
    const tree = fsNodesToVaultTree(fsNodes)

    const vaultId = crypto.randomUUID()
    const newVault: Vault = {
      id: vaultId,
      name: vaultName,
      dirPath: selectedPath,
      createdAt: now,
      lastOpened: now,
      tree
    }

    const existing = vaults.findIndex((v) => v.name === vaultName)
    let updated: Vault[]
    if (existing !== -1) {
      updated = [...vaults]
      updated[existing] = newVault
    } else {
      updated = [newVault, ...vaults]
    }

    persistVaults(updated)
    localStorage.setItem('netherite-current-vault', vaultName)
    localStorage.setItem('netherite-current-vault-id', vaultId)
    localStorage.setItem('netherite-current-vault-path', selectedPath)
    navigate('/dashboard')
  }

  /* ── Re-open recent ───────────────────────────────── */
  const openRecentVault = async (vault: Vault) => {
    if (vault.dirPath) {
      const fsNodes = await window.electronAPI.readFolder(vault.dirPath)
      const tree = fsNodesToVaultTree(fsNodes)
      const updated = vaults.map((v) =>
        v.id === vault.id ? { ...v, lastOpened: new Date().toISOString(), tree } : v
      )
      persistVaults(updated)
    } else {
      const updated = vaults.map((v) =>
        v.id === vault.id ? { ...v, lastOpened: new Date().toISOString() } : v
      )
      persistVaults(updated)
    }
    localStorage.setItem('netherite-current-vault', vault.name)
    localStorage.setItem('netherite-current-vault-id', vault.id)
    if (vault.dirPath) localStorage.setItem('netherite-current-vault-path', vault.dirPath)
    navigate('/dashboard')
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays} days ago`
  }

  return (
    <div className="min-h-screen bg-[#0a0808] flex flex-col">
      <TitleBar minimal />

      {/* Header */}
      <header className="p-6 flex items-start justify-end w-full">
        <ProfileButton />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-16 w-full max-w-2xl mx-auto">
        
        {/* Logo Area */}
        <div className="flex flex-col items-center mb-12">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#ff5625] text-4xl">&#x2B21;</span>
            <span className="text-white font-bold text-3xl tracking-tight">Netherite</span>
          </div>
          <p className="text-[#a8a0a0] text-sm tracking-wide">Your second brain. Built different.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <button
            onClick={() => setShowCreateModal(true)}
            className="group flex-1 bg-[#0a0808] border border-[#2a2422] hover:border-[#ff5625]/50 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(255,86,37,0.1)]"
          >
            <FolderPlus className="w-8 h-8 text-[#a8a0a0] group-hover:text-[#ff5625] transition-colors" />
            <span className="text-white font-medium">Create New Vault</span>
          </button>
          <button
            onClick={openVaultFromDisk}
            className="group flex-1 bg-[#0a0808] border border-[#2a2422] hover:border-[#ffb77d]/50 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(255,183,125,0.1)]"
          >
            <FolderOpen className="w-8 h-8 text-[#a8a0a0] group-hover:text-[#ffb77d] transition-colors" />
            <span className="text-white font-medium">Open Vault</span>
          </button>
        </div>

        {vaults.length > 0 && (
          <div className="w-full mt-12">
            <h2 className="text-[#ffb77d] text-xs uppercase tracking-widest font-bold mb-3 px-1">
              Your Vaults
            </h2>
            <div className="bg-[#0a0808] border border-[#2a2422] rounded-lg divide-y divide-[#2a2422]">
              {vaults.map((vault, index) => (
                <div key={vault.id || index} className="w-full flex items-center justify-between p-4 hover:bg-[#111111] transition-colors group">
                  <button
                    onClick={() => openRecentVault(vault)}
                    className="flex-1 flex items-center justify-between text-left cursor-pointer mr-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium truncate">{vault.name}</p>
                      <p className="text-[#a8a0a0] text-sm truncate">
                        Created {formatTimeAgo(vault.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[#444444] text-xs">
                        {formatTimeAgo(vault.lastOpened)}
                      </span>
                    </div>
                  </button>
                  <button onClick={() => {
                    const updated = vaults.filter(v => v.id !== vault.id);
                    persistVaults(updated);
                  }} className="p-2 text-[#444444] hover:text-[#ff5449] hover:bg-[#ff5449]/10 rounded-md transition-colors" title="Remove vault from Netherite">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 text-center">
        <p className="text-[#444444] text-xs">Netherite v1.0</p>
      </footer>

      {/* Create Vault Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0808] border border-[#2a2422] rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-lg font-semibold">Create New Vault</h3>
              <button
                onClick={() => { setShowCreateModal(false); setNewVaultName('') }}
                className="text-[#a8a0a0] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <label htmlFor="vault-name" className="block text-[#a8a0a0] text-sm mb-2">
                Vault Name
              </label>
              <input
                id="vault-name"
                type="text"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createVault() }}
                placeholder="My Study Vault"
                className="w-full bg-[#111111] border border-[#2a2422] rounded-lg px-4 py-3 text-white placeholder:text-[#444444] focus:outline-none focus:border-[#ff5625]/70 transition-colors"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setNewVaultName('') }}
                className="flex-1 px-4 py-2.5 bg-[#111111] border border-[#2a2422] rounded-lg text-[#a8a0a0] hover:bg-[#1f1d1d] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={createVault}
                disabled={!newVaultName.trim()}
                className="flex-1 px-4 py-2.5 bg-[#ff5625] rounded-lg text-white font-medium hover:bg-[#ff5625]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Create Vault
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
