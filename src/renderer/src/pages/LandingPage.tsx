import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, FolderPlus, X } from 'lucide-react'
import { Toaster, toast } from 'sonner'

import ProfileButton from '@/components/ProfileButton'
import TitleBar from '@/components/TitleBar'
import {
  ensureGuestMigration,
  getDeviceVaultPath,
  rememberDeviceVault,
  removeDeviceVaultPath,
  readAccountDataFile,
  type StoredVaultEntry,
  writeAccountDataFile
} from '@/hooks/use-data'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'

interface VaultFileNode {
  id: string
  type: 'file'
  name: string
  path: string
  content?: string
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
  vaultId?: string
  name: string
  dirPath: string | null
  lastOpened: string
  tree: VaultNode[]
}

type OwnershipPromptState = {
  path: string
  name: string
}

type MissingVaultPromptState = {
  path: string
  name: string
  vaultId?: string
}

type VaultUpdateState = {
  status: 'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error'
  remoteSnapshotAt?: string
  snapshotName?: string
}

type PendingSyncPromptState = {
  vault: Vault
  remoteSnapshotAt?: string
}

function fsNodesToVaultTree(nodes: { name: string; type: string; path: string; children?: any[] }[]): VaultNode[] {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      return {
        id: crypto.randomUUID(),
        type: 'folder',
        name: node.name,
        path: node.path,
        children: node.children ? fsNodesToVaultTree(node.children) : []
      }
    }

    return {
      id: crypto.randomUUID(),
      type: 'file',
      name: node.name,
      path: node.path
    }
  })
}

function sanitizeVaultName(name: string): string {
  return name
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim()
}

function normalizeStoredPath(dirPath: string): string
function normalizeStoredPath(dirPath: string | null): string | null
function normalizeStoredPath(dirPath: string | null | undefined): string | null
function normalizeStoredPath(dirPath: string | null | undefined) {
  return dirPath ? dirPath.replace(/\\/g, '/') : null
}

function getVaultNameFromPath(vaultPath: string) {
  return vaultPath.split(/[\\/]/).filter(Boolean).pop() || 'Vault'
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function setCurrentVaultSelection(vault: { id: string; name: string; dirPath: string | null }, readOnly = false) {
  const normalizedPath = normalizeStoredPath(vault.dirPath)
  localStorage.setItem('netherite-current-vault', vault.name)
  localStorage.setItem('netherite-current-vault-id', vault.id)
  localStorage.setItem('netherite-current-vault-read-only', readOnly ? 'true' : 'false')
  if (normalizedPath) {
    localStorage.setItem('netherite-current-vault-path', normalizedPath)
  } else {
    localStorage.removeItem('netherite-current-vault-path')
  }
  window.dispatchEvent(new Event('local-storage'))
}

function dedupeStoredVaultEntries(entries: StoredVaultEntry[]) {
  const sortedEntries = [...entries].sort(
    (left, right) => new Date(right.lastOpened).getTime() - new Date(left.lastOpened).getTime()
  )
  const seenVaultIds = new Set<string>()
  const seenFallbackNames = new Set<string>()

  return sortedEntries.filter((entry) => {
    if (entry.vaultId) {
      if (seenVaultIds.has(entry.vaultId)) {
        return false
      }

      seenVaultIds.add(entry.vaultId)
      return true
    }

    const fallbackName = entry.name.toLowerCase()
    if (seenFallbackNames.has(fallbackName)) {
      return false
    }

    seenFallbackNames.add(fallbackName)
    return true
  })
}

function dedupeVaultRecords(entries: Vault[]) {
  const sortedEntries = [...entries].sort(
    (left, right) => new Date(right.lastOpened).getTime() - new Date(left.lastOpened).getTime()
  )
  const seenVaultIds = new Set<string>()
  const seenPaths = new Set<string>()
  const seenFallbackNames = new Set<string>()

  return sortedEntries.filter((entry) => {
    const normalizedPath = normalizeStoredPath(entry.dirPath)
    const fallbackName = entry.name.toLowerCase()

    if (entry.vaultId && seenVaultIds.has(entry.vaultId)) {
      return false
    }

    if (normalizedPath && seenPaths.has(normalizedPath)) {
      return false
    }

    if (!entry.vaultId && !normalizedPath && seenFallbackNames.has(fallbackName)) {
      return false
    }

    if (entry.vaultId) {
      seenVaultIds.add(entry.vaultId)
    }

    if (normalizedPath) {
      seenPaths.add(normalizedPath)
    } else {
      seenFallbackNames.add(fallbackName)
    }

    return true
  })
}

function fromStoredVaults(entries: StoredVaultEntry[]) {
  const mappedEntries = dedupeStoredVaultEntries(entries).map((entry) => ({
    id: entry.vaultId ?? normalizeStoredPath(entry.path) ?? crypto.randomUUID(),
    vaultId: entry.vaultId,
    name: (() => {
      const resolvedPath = getDeviceVaultPath(entry.vaultId, entry.path ?? null)
      const looksLikePath = /[\\/]/.test(entry.name)
      if (looksLikePath) {
        return getVaultNameFromPath(resolvedPath ?? entry.name)
      }
      return entry.name
    })(),
    dirPath: normalizeStoredPath(getDeviceVaultPath(entry.vaultId, entry.path ?? null)),
    lastOpened: entry.lastOpened,
    tree: []
  }))

  return dedupeVaultRecords(mappedEntries)
}

function dedupeMissingVaultPrompts(prompts: MissingVaultPromptState[]) {
  const seenKeys = new Set<string>()

  return prompts.filter((prompt) => {
    const key = `${prompt.vaultId ?? ''}|${normalizeStoredPath(prompt.path) ?? prompt.path}`
    if (seenKeys.has(key)) {
      return false
    }

    seenKeys.add(key)
    return true
  })
}

export default function LandingPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')
  const restoreSnapshot = useSyncStore((state) => state.restoreSnapshot)
  const syncVault = useSyncStore((state) => state.syncVault)
  const checkVaultUpdate = useSyncStore((state) => state.checkVaultUpdate)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showOwnershipPrompt, setShowOwnershipPrompt] = useState<OwnershipPromptState | null>(null)
  const [missingVaultPrompt, setMissingVaultPrompt] = useState<MissingVaultPromptState | null>(null)
  const [missingVaultQueue, setMissingVaultQueue] = useState<MissingVaultPromptState[]>([])
  const [vaultUpdateStates, setVaultUpdateStates] = useState<Record<string, VaultUpdateState>>({})
  const [pendingSyncPrompt, setPendingSyncPrompt] = useState<PendingSyncPromptState | null>(null)
  const [newVaultName, setNewVaultName] = useState('')
  const [isPersistingVaults, setIsPersistingVaults] = useState(false)
  const vaultLoadRequestRef = useRef(0)
  const startupVaultCheckKeyRef = useRef('')

  const sortedVaults = useMemo(
    () => [...vaults].sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()),
    [vaults]
  )

  useEffect(() => {
    const requestId = vaultLoadRequestRef.current + 1
    vaultLoadRequestRef.current = requestId
    setVaults([])
    setMissingVaultQueue([])
    setMissingVaultPrompt(null)
    setVaultUpdateStates({})
    setPendingSyncPrompt(null)
    startupVaultCheckKeyRef.current = ''

    if (userId === 'guest') {
      return
    }

    const loadVaults = async () => {
      await ensureGuestMigration(userId)

      const accountVaults = await readAccountDataFile<StoredVaultEntry[]>(userId, 'vaults', [])
      if (vaultLoadRequestRef.current !== requestId) {
        return
      }

      if (accountVaults.length > 0) {
        setVaults(fromStoredVaults(accountVaults))
        return
      }
      setVaults([])
    }

    void loadVaults()
  }, [userId])

  useEffect(() => {
    if (missingVaultPrompt || missingVaultQueue.length === 0) {
      return
    }

    const [nextPrompt, ...rest] = missingVaultQueue
    setMissingVaultPrompt(nextPrompt)
    setMissingVaultQueue(rest)
  }, [missingVaultPrompt, missingVaultQueue])

  useEffect(() => {
    if (userId === 'guest' || vaults.length === 0) {
      return
    }

    const startupKey = `${userId}|${vaults
      .map((vault) => `${vault.vaultId ?? vault.id}:${normalizeStoredPath(vault.dirPath) ?? ''}`)
      .sort()
      .join('|')}`

    if (startupVaultCheckKeyRef.current === startupKey) {
      return
    }

    startupVaultCheckKeyRef.current = startupKey
    let cancelled = false

    const checkAllVaultsOnLanding = async () => {
      const vaultChecks = await Promise.all(
        vaults.map(async (vault) => {
          if (!vault.dirPath) {
            return {
              vault,
              exists: false
            }
          }

          const exists = await window.electronAPI.directoryExists(vault.dirPath)
          return {
            vault,
            exists
          }
        })
      )

      if (cancelled) {
        return
      }

      const missingPrompts = vaultChecks
        .filter(({ vault, exists }) => vault.dirPath && !exists)
        .map(({ vault }) => ({
          path: vault.dirPath!,
          name: vault.name || getVaultNameFromPath(vault.dirPath!),
          vaultId: vault.vaultId
        }))

      if (!cancelled && missingPrompts.length > 0) {
        setMissingVaultQueue((current) =>
          dedupeMissingVaultPrompts([
            ...(missingVaultPrompt ? [missingVaultPrompt] : []),
            ...current,
            ...missingPrompts
          ])
        )
      }

      const existingVaults = vaultChecks.filter(
        ({ vault, exists }) => exists && Boolean(vault.dirPath) && Boolean(vault.vaultId)
      )

      if (!cancelled) {
        setVaultUpdateStates((current) => {
          const nextState = { ...current }
          for (const { vault } of existingVaults) {
            const key = vault.vaultId ?? vault.id
            nextState[key] = {
              status: 'checking'
            }
          }
          return nextState
        })
      }

      void Promise.allSettled(
        existingVaults.map(async ({ vault }) => {
          if (cancelled || !vault.vaultId) {
            return
          }

          const result = await checkVaultUpdate(vault.vaultId)
          if (cancelled) {
            return
          }

          setVaultUpdateStates((current) => ({
            ...current,
            [vault.vaultId!]: result.hasUpdate
              ? {
                  status: 'updateAvailable',
                  remoteSnapshotAt: result.remoteSnapshot?.snapshotAt,
                  snapshotName: result.remoteSnapshot?.snapshotName
                }
              : {
                  status: 'upToDate',
                  remoteSnapshotAt: result.remoteSnapshot?.snapshotAt,
                  snapshotName: result.remoteSnapshot?.snapshotName
                }
          }))
        })
      )
    }

    void checkAllVaultsOnLanding()

    return () => {
      cancelled = true
    }
  }, [checkVaultUpdate, missingVaultPrompt, userId, vaults])

  const persistVaults = async (updated: Vault[]) => {
    if (userId === 'guest') {
      setVaults([])
      return
    }

    const dedupedVaults = dedupeVaultRecords(updated)
    setVaults(dedupedVaults)
    setIsPersistingVaults(true)
    try {
      const payload: StoredVaultEntry[] = dedupedVaults
        .map((vault) => ({
          name: vault.name,
          lastOpened: vault.lastOpened,
          vaultId: vault.vaultId
        }))

      await writeAccountDataFile(userId, 'vaults', payload)
    } finally {
      setIsPersistingVaults(false)
    }
  }

  const registerRecoveredVault = async (
    requestedPath: string,
    vaultName: string,
    options?: {
      replaceVaultId?: string
      preferredVaultId?: string
      touchLastOpened?: boolean
    }
  ) => {
    const config = await window.electronAPI.initVault(requestedPath, userId)
    const normalizedPath = normalizeStoredPath(requestedPath)
    const nextVaultId = config?.vaultId || options?.preferredVaultId || crypto.randomUUID()
    const replaceVaultId = options?.replaceVaultId

    const existingVault = vaults.find(
      (vault) =>
        (replaceVaultId && vault.vaultId === replaceVaultId) ||
        (vault.vaultId && vault.vaultId === nextVaultId) ||
        normalizeStoredPath(vault.dirPath) === normalizedPath
    )

    const nextVault: Vault = {
      id: nextVaultId,
      vaultId: nextVaultId,
      name: vaultName,
      dirPath: normalizedPath,
      lastOpened: options?.touchLastOpened ? new Date().toISOString() : existingVault?.lastOpened ?? new Date().toISOString(),
      tree: existingVault?.tree ?? []
    }

    const updatedVaults = existingVault
      ? vaults.map((vault) => (vault === existingVault ? nextVault : vault))
      : [nextVault, ...vaults]

    await persistVaults(updatedVaults)

    if (replaceVaultId && replaceVaultId !== nextVaultId) {
      removeDeviceVaultPath(replaceVaultId)
    }

    if (normalizedPath) {
      rememberDeviceVault(nextVaultId, vaultName, normalizedPath)
    }

    return nextVault
  }

  const finalizeVaultOpen = async (
    requestedPath: string,
    options?: {
      readOnly?: boolean
      vaultName?: string
      replaceVaultId?: string
    }
  ) => {
    const readOnly = options?.readOnly === true
    const replaceVaultId = options?.replaceVaultId

    const activePath = await window.electronAPI.activateVault(requestedPath, { readOnly })
    const config = readOnly ? null : await window.electronAPI.initVault(activePath, userId)

    const tree = fsNodesToVaultTree(await window.electronAPI.readFolder(activePath))
    const normalizedPath = normalizeStoredPath(activePath)
    const vaultName = options?.vaultName || getVaultNameFromPath(activePath)
    const now = new Date().toISOString()
    const vaultId = config?.vaultId || crypto.randomUUID()

    const nextVault: Vault = {
      id: vaultId,
      vaultId,
      name: vaultName,
      dirPath: normalizedPath,
      lastOpened: now,
      tree
    }

    const existingIndex = vaults.findIndex(
      (vault) =>
        (replaceVaultId && vault.vaultId === replaceVaultId) ||
        (vault.vaultId && vault.vaultId === vaultId) || normalizeStoredPath(vault.dirPath) === normalizedPath
    )
    const updatedVaults =
      existingIndex === -1
        ? [nextVault, ...vaults]
        : vaults.map((vault, index) => (index === existingIndex ? nextVault : vault))

    await persistVaults(updatedVaults)
    if (replaceVaultId && replaceVaultId !== vaultId) {
      removeDeviceVaultPath(replaceVaultId)
    }
    if (normalizedPath) {
      rememberDeviceVault(vaultId, vaultName, normalizedPath)
    }
    setCurrentVaultSelection({ id: vaultId, name: vaultName, dirPath: normalizedPath }, readOnly)
    navigate('/dashboard')
  }

  const resolveOwnershipAndOpen = async (
    requestedPath: string,
    vaultName?: string,
    replaceVaultId?: string
  ) => {
    try {
      const ownership = await window.electronAPI.checkVaultOwnership(requestedPath, userId)
      if (ownership.owned === false) {
        setShowOwnershipPrompt({
          path: requestedPath,
          name: vaultName || getVaultNameFromPath(requestedPath)
        })
        return
      }

      await finalizeVaultOpen(requestedPath, { vaultName, replaceVaultId })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open that vault.'))
    }
  }

  const createVault = async () => {
    if (!newVaultName.trim()) return

    const safeName = sanitizeVaultName(newVaultName)
    if (!safeName) {
      toast.error('Vault name is invalid.')
      return
    }

    const selectedPath = await window.electronAPI.selectFolder()
    if (!selectedPath) return

    try {
      const dirPath = await window.electronAPI.createVault(
        selectedPath,
        safeName,
        '# Welcome\nThis is your vault.\n\nStart writing your notes here.'
      )

      await finalizeVaultOpen(dirPath, { vaultName: safeName })

      setShowCreateModal(false)
      setNewVaultName('')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create vault.'))
    }
  }

  const openVaultFromDisk = async () => {
    const selectedPath = await window.electronAPI.selectFolder()
    if (!selectedPath) return

    await resolveOwnershipAndOpen(selectedPath)
  }

  const openRecentVault = async (vault: Vault) => {
    if (!vault.dirPath) {
      toast.error('Vault path unavailable on this device.')
      return
    }

    const updateState = vaultUpdateStates[vault.vaultId ?? vault.id]
    if (vault.vaultId && userId !== 'guest' && updateState?.status === 'updateAvailable') {
      setPendingSyncPrompt({
        vault,
        remoteSnapshotAt: updateState.remoteSnapshotAt
      })
      return
    }

    await resolveOwnershipAndOpen(vault.dirPath, vault.name)
  }

  const handleSyncPromptNow = async () => {
    if (!pendingSyncPrompt?.vault.dirPath || !pendingSyncPrompt.vault.vaultId) {
      setPendingSyncPrompt(null)
      return
    }

    try {
      await syncVault(pendingSyncPrompt.vault.dirPath, pendingSyncPrompt.vault.vaultId)
      setVaultUpdateStates((current) => ({
        ...current,
        [pendingSyncPrompt.vault.vaultId!]: {
          status: 'upToDate',
          remoteSnapshotAt: pendingSyncPrompt.remoteSnapshotAt
        }
      }))
      const nextVault = pendingSyncPrompt.vault
      setPendingSyncPrompt(null)
      await resolveOwnershipAndOpen(nextVault.dirPath!, nextVault.name)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Cloud sync failed. You can still open the local vault.'))
    }
  }

  const handleSyncPromptLater = async () => {
    if (!pendingSyncPrompt?.vault.dirPath) {
      setPendingSyncPrompt(null)
      return
    }

    const nextVault = pendingSyncPrompt.vault
    setPendingSyncPrompt(null)
    await resolveOwnershipAndOpen(nextVault.dirPath, nextVault.name)
  }

  const handleCreateAgain = async () => {
    if (!missingVaultPrompt) {
      return
    }

    const savedPath = normalizeStoredPath(missingVaultPrompt.path)
    if (!savedPath) {
      return
    }

    const pathParts = savedPath.split('/').filter(Boolean)
    const vaultName = pathParts[pathParts.length - 1]
    const parentPath = savedPath.slice(0, savedPath.length - vaultName.length - 1)

    if (!parentPath) {
      toast.error('Could not determine the parent folder for this vault.')
      return
    }

    const parentExists = await window.electronAPI.directoryExists(parentPath)
    if (!parentExists) {
      toast.error('The parent folder no longer exists. Choose a different location instead.')
      return
    }

    try {
      // Try to restore from cloud snapshot first
      if (missingVaultPrompt.vaultId) {
        const restored = await restoreSnapshot(missingVaultPrompt.vaultId, savedPath)
        if (restored) {
          await registerRecoveredVault(savedPath, vaultName, {
            replaceVaultId: missingVaultPrompt.vaultId,
            preferredVaultId: missingVaultPrompt.vaultId
          })
          setMissingVaultPrompt(null)
          return
        }
      }

      // No snapshot available — create a fresh vault
      const dirPath = await window.electronAPI.createVaultAtPath(
        savedPath,
        '# Welcome\nThis is your vault.\n\nStart writing your notes here.'
      )

      setMissingVaultPrompt(null)
      await registerRecoveredVault(dirPath, vaultName, {
        replaceVaultId: missingVaultPrompt.vaultId,
        preferredVaultId: missingVaultPrompt.vaultId
      })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not restore the vault here.'))
    }
  }

  const handleChooseDifferentLocation = () => {
    if (!missingVaultPrompt) {
      return
    }

    void (async () => {
      const prompt = missingVaultPrompt
      const selectedPath = await window.electronAPI.selectFolder()
      if (!selectedPath) {
        return
      }

      try {
        // Append vault name as subfolder inside the selected parent directory
        const vaultFolderName = prompt.name || 'Vault'
        const targetPath = normalizeStoredPath(`${selectedPath}/${vaultFolderName}`)

        setMissingVaultPrompt(null)

        if (prompt.vaultId) {
          rememberDeviceVault(prompt.vaultId, prompt.name, targetPath)
        }

        const existingVaultIndex = vaults.findIndex((vault) => vault.vaultId === prompt.vaultId)
        if (existingVaultIndex !== -1) {
          const relocatedVaults = vaults.map((vault, index) =>
            index === existingVaultIndex
              ? {
                  ...vault,
                  dirPath: targetPath,
                  lastOpened: new Date().toISOString()
                }
              : vault
          )
          await persistVaults(relocatedVaults)
        }

        // Try to restore from cloud snapshot into the vault-name subfolder
        if (prompt.vaultId) {
          const restored = await restoreSnapshot(prompt.vaultId, targetPath)
          if (restored) {
            await registerRecoveredVault(targetPath, prompt.name, {
              replaceVaultId: prompt.vaultId,
              preferredVaultId: prompt.vaultId
            })
            return
          }
        }

        // No snapshot available — create a fresh vault at this location
        try {
          const dirPath = await window.electronAPI.createVaultAtPath(
            targetPath,
            '# Welcome\nThis is your vault.\n\nStart writing your notes here.'
          )
          await registerRecoveredVault(dirPath, prompt.name, {
            replaceVaultId: prompt.vaultId,
            preferredVaultId: prompt.vaultId
          })
        } catch (createError) {
          toast.error(getErrorMessage(createError, 'Could not create a vault at that location.'))
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not restore this vault to the selected location.'))
      }
    })()
  }

  const handleLocateExistingVault = async () => {
    if (!missingVaultPrompt) {
      return
    }

    const prompt = missingVaultPrompt
    const selectedPath = await window.electronAPI.selectFolder()
    if (!selectedPath) {
      return
    }

    // Validate: folder name should match the vault name
    const selectedFolderName = selectedPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
    if (selectedFolderName.toLowerCase() !== prompt.name.toLowerCase()) {
      toast.error(
        `Folder name "${selectedFolderName}" doesn't match vault name "${prompt.name}". Please select the correct folder.`
      )
      return
    }

    // Save new path to local storage
    if (prompt.vaultId) {
      rememberDeviceVault(prompt.vaultId, prompt.name, normalizeStoredPath(selectedPath))
    }

    // Smart sync: compare with server and update newer files
    if (prompt.vaultId && userId !== 'guest') {
      try {
        await syncVault(selectedPath, prompt.vaultId)
      } catch {
        // Non-fatal: vault is still usable
      }
    }

    setMissingVaultPrompt(null)
    await registerRecoveredVault(selectedPath, prompt.name, {
      replaceVaultId: prompt.vaultId,
      preferredVaultId: prompt.vaultId
    })
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

  const formatVaultUpdateLabel = (vault: Vault) => {
    const updateState = vaultUpdateStates[vault.vaultId ?? vault.id]
    switch (updateState?.status) {
      case 'checking':
        return {
          text: 'Checking cloud updates...',
          className: 'text-[var(--nv-secondary)]'
        }
      case 'updateAvailable':
        return {
          text: updateState.remoteSnapshotAt
            ? `Cloud update available · ${formatTimeAgo(updateState.remoteSnapshotAt)}`
            : 'Cloud update available',
          className: 'text-[var(--nv-primary)]'
        }
      case 'upToDate':
        return {
          text: 'Cloud status: up to date',
          className: 'text-[var(--nv-subtle)]'
        }
      case 'error':
        return {
          text: 'Cloud check failed',
          className: 'text-[var(--nv-danger)]'
        }
      default:
        return null
    }
  }

  const handleOpenReadOnly = async () => {
    if (!showOwnershipPrompt) return

    const prompt = showOwnershipPrompt
    setShowOwnershipPrompt(null)
    try {
      await finalizeVaultOpen(prompt.path, {
        readOnly: true,
        vaultName: prompt.name
      })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open this vault in read-only mode.'))
    }
  }

  const handleCloneVault = async () => {
    if (!showOwnershipPrompt) return

    const prompt = showOwnershipPrompt
    setShowOwnershipPrompt(null)

    try {
      const clonePath = await window.electronAPI.cloneVault(prompt.path, userId)
      await finalizeVaultOpen(clonePath, { vaultName: getVaultNameFromPath(clonePath) })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not clone this vault.'))
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      <Toaster richColors theme="dark" />
      <TitleBar minimal />

      <header className="flex w-full items-start justify-end p-6">
        <ProfileButton />
      </header>

      <main className="mx-auto -mt-16 flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6">
        <div className="mb-12 flex flex-col items-center">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-4xl text-[var(--nv-primary)]">&#x2B21;</span>
            <span className="text-3xl font-bold tracking-tight text-[var(--nv-foreground)]">Netherite</span>
          </div>
          <p className="text-sm tracking-wide text-[var(--nv-muted)]">Your second brain. Built different.</p>
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row">
          <button
            onClick={() => setShowCreateModal(true)}
            className="group flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-8 transition-all hover:border-[var(--nv-primary)]/50 hover:shadow-[0_0_20px_var(--nv-primary-glow)]"
          >
            <FolderPlus className="h-8 w-8 text-[var(--nv-muted)] transition-colors group-hover:text-[var(--nv-primary)]" />
            <span className="font-medium text-[var(--nv-foreground)]">Create New Vault</span>
          </button>
          <button
            onClick={openVaultFromDisk}
            className="group flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-8 transition-all hover:border-[var(--nv-secondary)]/50 hover:shadow-[0_0_20px_var(--nv-secondary-soft)]"
          >
            <FolderOpen className="h-8 w-8 text-[var(--nv-muted)] transition-colors group-hover:text-[var(--nv-secondary)]" />
            <span className="font-medium text-[var(--nv-foreground)]">Open Vault</span>
          </button>
        </div>

        {sortedVaults.length > 0 && (
          <div className="mt-12 w-full">
            <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-widest text-[var(--nv-secondary)]">
              Your Vaults
            </h2>
            <div className="divide-y divide-[var(--nv-border)] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)]">
              {sortedVaults.map((vault) => (
                (() => {
                  const vaultUpdateLabel = formatVaultUpdateLabel(vault)

                  return (
                    <div key={vault.id} className="group flex w-full items-center justify-between p-4 transition-colors hover:bg-[var(--nv-surface)]">
                      <button
                        onClick={() => openRecentVault(vault)}
                        className="mr-4 flex flex-1 cursor-pointer items-center justify-between text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[var(--nv-foreground)]">{vault.name}</p>
                          <p className="truncate text-sm text-[var(--nv-muted)]">
                            {vault.dirPath || 'Vault path unavailable'}
                          </p>
                          {vaultUpdateLabel ? (
                            <p className={`mt-1 truncate text-xs ${vaultUpdateLabel.className}`}>
                              {vaultUpdateLabel.text}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-xs text-[var(--nv-subtle)]">{formatTimeAgo(vault.lastOpened)}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          removeDeviceVaultPath(vault.vaultId)
                          void persistVaults(vaults.filter((item) => item.id !== vault.id))
                        }}
                        className="rounded-md p-2 text-[var(--nv-subtle)] transition-colors hover:bg-[var(--nv-danger-soft)] hover:text-[var(--nv-danger)]"
                        title="Remove vault from Netherite"
                        disabled={isPersistingVaults}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })()
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 text-center">
        <p className="text-xs text-[var(--nv-subtle)]">Netherite v1.0</p>
      </footer>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--nv-foreground)]">Create New Vault</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewVaultName('')
                }}
                className="cursor-pointer text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <label htmlFor="vault-name" className="mb-2 block text-sm text-[var(--nv-muted)]">
                Vault Name
              </label>
              <input
                id="vault-name"
                type="text"
                value={newVaultName}
                onChange={(event) => setNewVaultName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void createVault()
                  }
                }}
                placeholder="My Study Vault"
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-[var(--nv-foreground)] transition-colors placeholder:text-[var(--nv-subtle)] focus:border-[var(--nv-primary)]/70 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewVaultName('')
                }}
                className="flex-1 cursor-pointer rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-2.5 text-[var(--nv-muted)] transition-colors hover:bg-[var(--nv-surface-strong)]"
              >
                Cancel
              </button>
              <button
                onClick={() => void createVault()}
                disabled={!newVaultName.trim()}
                className="flex-1 cursor-pointer rounded-lg bg-[var(--nv-primary)] px-4 py-2.5 font-medium text-black transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {showOwnershipPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--nv-foreground)]">Vault Ownership</h3>
              <button
                onClick={() => setShowOwnershipPrompt(null)}
                className="cursor-pointer text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--nv-muted)]">
              <span className="font-semibold text-[var(--nv-foreground)]">{showOwnershipPrompt.name}</span>
              {' '}belongs to a different account. You can open it read-only or create your own clone.
            </p>

            <div className="mt-6 grid gap-3">
              <button
                onClick={() => void handleOpenReadOnly()}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-left text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-secondary)]"
              >
                <span className="block font-medium">Open as Read-only</span>
                <span className="mt-1 block text-sm text-[var(--nv-muted)]">
                  Browse the vault without taking ownership or writing changes.
                </span>
              </button>

              <button
                onClick={() => void handleCloneVault()}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-left text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-primary)]"
              >
                <span className="block font-medium">Clone Vault</span>
                <span className="mt-1 block text-sm text-[var(--nv-muted)]">
                  Make your own copy next to the original and claim that clone as yours.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {missingVaultPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--nv-foreground)]">Vault Not Found</h3>
              <button
                onClick={() => setMissingVaultPrompt(null)}
                className="cursor-pointer text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--nv-muted)]">
              Vault not found at <span className="font-semibold text-[var(--nv-foreground)]">{missingVaultPrompt.path}</span>.
              Would you like to restore it from your synced data, choose a different location, or locate the existing vault?
            </p>

            <div className="mt-6 grid gap-3">
              <button
                onClick={() => void handleCreateAgain()}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-left text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-primary)]"
              >
                <span className="block font-medium">Create Again</span>
                <span className="mt-1 block text-sm text-[var(--nv-muted)]">
                  Restore this vault from your synced data, or create a fresh one at the same path.
                </span>
              </button>

              <button
                onClick={handleChooseDifferentLocation}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-left text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-secondary)]"
              >
                <span className="block font-medium">Choose a Different Location</span>
                <span className="mt-1 block text-sm text-[var(--nv-muted)]">
                  Pick another folder and restore your synced vault there.
                </span>
              </button>

              <button
                onClick={() => void handleLocateExistingVault()}
                className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-left text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-secondary)]"
              >
                <span className="block font-medium">Locate Existing Vault</span>
                <span className="mt-1 block text-sm text-[var(--nv-muted)]">
                  Point to the existing folder and check for any newer changes from the server.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSyncPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--nv-foreground)]">Cloud Update Available</h3>
              <button
                onClick={() => setPendingSyncPrompt(null)}
                className="cursor-pointer text-[var(--nv-muted)] transition-colors hover:text-[var(--nv-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--nv-muted)]">
              <span className="font-semibold text-[var(--nv-foreground)]">{pendingSyncPrompt.vault.name}</span>
              {' '}has a newer cloud snapshot
              {pendingSyncPrompt.remoteSnapshotAt ? ` from ${formatTimeAgo(pendingSyncPrompt.remoteSnapshotAt)}` : ''}.
              Do you want to sync it now before opening, or open your local copy first?
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => void handleSyncPromptLater()}
                className="flex-1 cursor-pointer rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-2.5 text-[var(--nv-muted)] transition-colors hover:bg-[var(--nv-surface-strong)]"
              >
                Later
              </button>
              <button
                onClick={() => void handleSyncPromptNow()}
                className="flex-1 cursor-pointer rounded-lg bg-[var(--nv-primary)] px-4 py-2.5 font-medium text-black transition-colors hover:opacity-90"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
