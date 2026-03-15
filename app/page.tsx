"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, FolderOpen, ChevronRight, X } from "lucide-react"

interface Vault {
  name: string
  createdAt: string
  lastOpened: string
}

export default function LandingPage() {
  const router = useRouter()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newVaultName, setNewVaultName] = useState("")

  useEffect(() => {
    const savedVaults = localStorage.getItem("netherite-vaults")
    if (savedVaults) {
      setVaults(JSON.parse(savedVaults))
    }
  }, [])

  const createVault = () => {
    if (!newVaultName.trim()) return

    const newVault: Vault = {
      name: newVaultName.trim(),
      createdAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
    }

    const updatedVaults = [newVault, ...vaults]
    setVaults(updatedVaults)
    localStorage.setItem("netherite-vaults", JSON.stringify(updatedVaults))
    localStorage.setItem("netherite-current-vault", newVault.name)

    setShowCreateModal(false)
    setNewVaultName("")
    router.push("/dashboard")
  }

  const openVault = (vault: Vault) => {
    const updatedVaults = vaults.map((v) =>
      v.name === vault.name ? { ...v, lastOpened: new Date().toISOString() } : v
    )
    setVaults(updatedVaults)
    localStorage.setItem("netherite-vaults", JSON.stringify(updatedVaults))
    localStorage.setItem("netherite-current-vault", vault.name)
    router.push("/dashboard")
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays === 1) return "Yesterday"
    return `${diffDays} days ago`
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-2xl">&#x2B21;</span>
          <span className="text-amber-500 font-semibold text-xl">Netherite</span>
        </div>
        <p className="text-zinc-500 text-sm mt-1 ml-8">
          Your second brain. Built different.
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
        {/* Vault Action Cards */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
          <button
            onClick={() => setShowCreateModal(true)}
            className="group flex-1 bg-zinc-900 border border-zinc-800 hover:border-amber-500/70 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors"
          >
            <FolderPlus className="w-8 h-8 text-zinc-400 group-hover:text-amber-500 transition-colors" />
            <span className="text-zinc-100 font-medium">Create New Vault</span>
          </button>
          <button
            onClick={() => {
              if (vaults.length > 0) {
                openVault(vaults[0])
              } else {
                setShowCreateModal(true)
              }
            }}
            className="group flex-1 bg-zinc-900 border border-zinc-800 hover:border-amber-500/70 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors"
          >
            <FolderOpen className="w-8 h-8 text-zinc-400 group-hover:text-amber-500 transition-colors" />
            <span className="text-zinc-100 font-medium">Open Vault</span>
          </button>
        </div>

        {/* Recent Vaults */}
        {vaults.length > 0 && (
          <div className="w-full max-w-xl mt-12">
            <h2 className="text-zinc-500 text-xs uppercase tracking-wider mb-3 px-1">
              Recent Vaults
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {vaults.map((vault) => (
                <button
                  key={vault.name}
                  onClick={() => openVault(vault)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors group text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-100 font-medium truncate">{vault.name}</p>
                    <p className="text-zinc-500 text-sm truncate">
                      Created {formatTimeAgo(vault.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-zinc-600 text-xs">
                      {formatTimeAgo(vault.lastOpened)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-500 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-6 text-center">
        <p className="text-zinc-600 text-xs">Netherite v1.0</p>
      </footer>

      {/* Create Vault Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-zinc-100 text-lg font-semibold">Create New Vault</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewVaultName("")
                }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <label htmlFor="vault-name" className="block text-zinc-400 text-sm mb-2">
                Vault Name
              </label>
              <input
                id="vault-name"
                type="text"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createVault()
                }}
                placeholder="My Study Vault"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewVaultName("")
                }}
                className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createVault}
                disabled={!newVaultName.trim()}
                className="flex-1 px-4 py-2.5 bg-amber-500 rounded-lg text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
