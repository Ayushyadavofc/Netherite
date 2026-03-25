"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, FolderOpen, ChevronRight, X } from "lucide-react"
import ProfileButton from "@/components/ProfileButton"

/* ── Types ─────────────────────────────────────────── */

interface VaultFileNode {
  id: string
  type: "file"
  name: string
  path: string          // relative path inside vault, e.g. "notes/idea.md"
  content: string
}

interface VaultFolderNode {
  id: string
  type: "folder"
  name: string
  path: string
  children: VaultNode[]
}

type VaultNode = VaultFileNode | VaultFolderNode

interface Vault {
  id: string
  name: string
  createdAt: string
  lastOpened: string
  tree: VaultNode[]     // full folder/file tree
}

/* ── Helpers ───────────────────────────────────────── */

/**
 * Build a nested folder/file tree from a flat list of File objects
 * returned by <input webkitdirectory>. Each file has a `webkitRelativePath`
 * like "VaultName/subfolder/note.md".
 */
async function buildTreeFromFiles(files: File[]): Promise<{ rootName: string; tree: VaultNode[] }> {
  // Filter .md files only
  const mdFiles = Array.from(files).filter((f) => f.name.endsWith(".md"))

  if (mdFiles.length === 0 && files.length > 0) {
    // No .md files — still capture folder name from any file
    const rootName = files[0].webkitRelativePath.split("/")[0]
    return { rootName, tree: [] }
  }

  if (mdFiles.length === 0) {
    return { rootName: "Untitled", tree: [] }
  }

  // Root folder name is the first segment of webkitRelativePath
  const rootName = mdFiles[0].webkitRelativePath.split("/")[0]

  // Map: folderPath → VaultFolderNode (so we can attach children)
  const folderMap = new Map<string, VaultFolderNode>()
  const topLevel: VaultNode[] = []

  // Ensure a folder node exists for every segment in a path
  const ensureFolder = (segments: string[]): VaultFolderNode | null => {
    if (segments.length === 0) return null

    let current: VaultFolderNode | null = null
    for (let i = 0; i < segments.length; i++) {
      const folderPath = segments.slice(0, i + 1).join("/")
      if (!folderMap.has(folderPath)) {
        const node: VaultFolderNode = {
          id: crypto.randomUUID(),
          type: "folder",
          name: segments[i],
          path: folderPath,
          children: [],
        }
        folderMap.set(folderPath, node)
        if (i === 0) {
          topLevel.push(node)
        } else {
          const parentPath = segments.slice(0, i).join("/")
          folderMap.get(parentPath)!.children.push(node)
        }
      }
      current = folderMap.get(folderPath)!
    }
    return current
  }

  for (const file of mdFiles) {
    const content = await file.text()
    // webkitRelativePath: "RootFolder/sub/note.md" — strip the root folder
    const relativePath = file.webkitRelativePath.split("/").slice(1).join("/")
    const parts = relativePath.split("/")
    const fileName = parts[parts.length - 1]
    const folderSegments = parts.slice(0, -1) // everything except the filename

    const fileNode: VaultFileNode = {
      id: crypto.randomUUID(),
      type: "file",
      name: fileName,
      path: relativePath,
      content,
    }

    if (folderSegments.length === 0) {
      // File is in the root of the vault
      topLevel.push(fileNode)
    } else {
      const parentFolder = ensureFolder(folderSegments)
      parentFolder!.children.push(fileNode)
    }
  }

  // Sort each level: folders first, then files, alphabetically
  const sortNodes = (nodes: VaultNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) {
      if (n.type === "folder") sortNodes(n.children)
    }
  }
  sortNodes(topLevel)

  return { rootName, tree: topLevel }
}

/* ── Component ─────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newVaultName, setNewVaultName] = useState("")
  const openInputRef = useRef<HTMLInputElement>(null)

  // Load vault metadata from localStorage on mount, migrating any legacy entries
  useEffect(() => {
    const saved = localStorage.getItem("netherite-vaults")
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
          localStorage.setItem("netherite-vaults", JSON.stringify(migrated))
        }
        setVaults(migrated)
      } catch { /* ignore */ }
    }
  }, [])

  /** Persist vault metadata list to localStorage + update state */
  const persistVaults = (updated: Vault[]) => {
    setVaults(updated)
    localStorage.setItem("netherite-vaults", JSON.stringify(updated))
  }

  /* ── Create New Vault ─────────────────────────────── */
  const createVault = () => {
    if (!newVaultName.trim()) return

    const vaultName = newVaultName.trim()
    const now = new Date().toISOString()

    const newVault: Vault = {
      id: crypto.randomUUID(),
      name: vaultName,
      createdAt: now,
      lastOpened: now,
      tree: [
        {
          id: crypto.randomUUID(),
          type: "file",
          name: "Welcome.md",
          path: "Welcome.md",
          content: "# Welcome\nThis is your vault.",
        },
      ],
    }

    const updated = [newVault, ...vaults]
    persistVaults(updated)
    localStorage.setItem("netherite-current-vault", vaultName)

    setShowCreateModal(false)
    setNewVaultName("")
    router.push("/dashboard")
  }

  /* ── Open Vault via file input ────────────────────── */
  const handleOpenVaultFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const { rootName, tree } = await buildTreeFromFiles(Array.from(files))
    const now = new Date().toISOString()

    const newVault: Vault = {
      id: crypto.randomUUID(),
      name: rootName,
      createdAt: now,
      lastOpened: now,
      tree,
    }

    // If a vault with the same name exists, replace it; otherwise prepend
    const existing = vaults.findIndex((v) => v.name === rootName)
    let updated: Vault[]
    if (existing !== -1) {
      updated = [...vaults]
      updated[existing] = newVault
    } else {
      updated = [newVault, ...vaults]
    }

    persistVaults(updated)
    localStorage.setItem("netherite-current-vault", rootName)

    // Reset the input so the same folder can be re-selected
    if (openInputRef.current) openInputRef.current.value = ""

    router.push("/dashboard")
  }

  /* ── Re-open a recent vault ───────────────────────── */
  const openRecentVault = (vault: Vault) => {
    const updated = vaults.map((v) =>
      v.id === vault.id ? { ...v, lastOpened: new Date().toISOString() } : v
    )
    persistVaults(updated)
    localStorage.setItem("netherite-current-vault", vault.name)
    router.push("/dashboard")
  }

  /* ── Utility ──────────────────────────────────────── */
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

  /* ── Render ───────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Hidden file input for Open Vault */}
      <input
        ref={openInputRef}
        type="file"
        className="hidden"
        onChange={handleOpenVaultFiles}
        /* @ts-expect-error webkitdirectory is non-standard but universally supported */
        webkitdirectory=""
        directory=""
        multiple
      />

      {/* Header */}
      <header className="p-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-500 text-2xl">&#x2B21;</span>
            <span className="text-amber-500 font-semibold text-xl">Netherite</span>
          </div>
          <p className="text-zinc-500 text-sm mt-1 ml-8">
            Your second brain. Built different.
          </p>
        </div>
        <ProfileButton />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
        {/* Vault Action Cards */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
          <button
            onClick={() => setShowCreateModal(true)}
            className="group flex-1 bg-zinc-900 border border-zinc-800 hover:border-amber-500/70 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer"
          >
            <FolderPlus className="w-8 h-8 text-zinc-400 group-hover:text-amber-500 transition-colors" />
            <span className="text-zinc-100 font-medium">Create New Vault</span>
          </button>
          <button
            onClick={() => openInputRef.current?.click()}
            className="group flex-1 bg-zinc-900 border border-zinc-800 hover:border-amber-500/70 rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer"
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
              {vaults.map((vault, index) => (
                <button
                  key={vault.id || index}
                  onClick={() => openRecentVault(vault)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors group text-left cursor-pointer"
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
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
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
                className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={createVault}
                disabled={!newVaultName.trim()}
                className="flex-1 px-4 py-2.5 bg-amber-500 rounded-lg text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
