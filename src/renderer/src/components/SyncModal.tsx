import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { getDeviceVaultPath, readAccountDataFile, type StoredVaultEntry } from '@/hooks/use-data'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'

type SyncModalProps = {
  isOpen: boolean
  onClose: () => void
}

type VaultItem = {
  vaultId: string
  label: string
  path: string
}

export function SyncModal({ isOpen, onClose }: SyncModalProps) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const uploadSnapshot = useSyncStore((state) => state.uploadSnapshot)
  const uploadAccountData = useSyncStore((state) => state.uploadAccountData)
  const syncAllVaults = useSyncStore((state) => state.syncAllVaults)
  const isSyncing = useSyncStore((state) => state.isSyncing)
  const syncStatus = useSyncStore((state) => state.syncStatus)
  const progress = useSyncStore((state) => state.progress)
  const progressDetails = useSyncStore((state) => state.progressDetails)
  const errorMessage = useSyncStore((state) => state.errorMessage)
  const setSyncModalOpen = useSyncStore((state) => state.setSyncModalOpen)

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [isLoadingVaults, setIsLoadingVaults] = useState(false)

  useEffect(() => {
    setSyncModalOpen(isOpen)
    return () => {
      setSyncModalOpen(false)
    }
  }, [isOpen, setSyncModalOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setVaultItems([])

    if (!user) {
      return
    }

    let cancelled = false

    const loadVaultItems = async () => {
      setIsLoadingVaults(true)

      try {
        const storedVaults = await readAccountDataFile<StoredVaultEntry[]>(user.$id, 'vaults', [])
        const nextVaultItems = (
          await Promise.all(
            storedVaults.map(async (vault) => {
              const localPath = getDeviceVaultPath(vault.vaultId, vault.path ?? null)
              if (!localPath || !vault.vaultId) {
                return null
              }

              try {
                const exists = await window.electronAPI.directoryExists(localPath)
                if (!exists) {
                  return null
                }

                return {
                  vaultId: vault.vaultId,
                  label: vault.name,
                  path: localPath
                } satisfies VaultItem
              } catch {
                return null
              }
            })
          )
        ).filter((item): item is VaultItem => item !== null)

        if (!cancelled) {
          setVaultItems(nextVaultItems)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingVaults(false)
        }
      }
    }

    void loadVaultItems()

    return () => {
      cancelled = true
    }
  }, [isOpen, user])

  const handleSyncVault = async (vault: VaultItem) => {
    await uploadSnapshot(vault.path, vault.vaultId)
  }

  const handleSyncAccount = async () => {
    await uploadAccountData()
  }

  const handleSyncAllVaults = async () => {
    await syncAllVaults(vaultItems)
  }

  const formatMegabytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="flex h-auto max-h-[88vh] w-[min(92vw,48rem)] max-w-[48rem] flex-col overflow-hidden border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-0 text-[var(--nv-foreground)]">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--nv-border)] px-6 py-5">
            <DialogTitle className="text-lg font-bold text-[var(--nv-secondary)]">Sync Netherite</DialogTitle>
            <DialogDescription className="mt-2 text-[var(--nv-muted)]">
              Upload account data and keep each vault stored as its own cloud entry.
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-5">
            {!isAuthenticated || !user ? (
              <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-5 text-sm text-[var(--nv-muted)]">
                Login required to sync
              </div>
            ) : (
              <div className="space-y-4">
                {/* Account Data */}
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--nv-muted)]">
                    Account Data
                  </p>
                  <div className="flex flex-col gap-3 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--nv-foreground)]">Habits, Todos, Themes, Settings</p>
                      <p className="text-xs text-[var(--nv-muted)]">Synced across all your devices</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSyncAccount()}
                      disabled={isSyncing}
                      className="ml-3 flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--nv-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSyncing ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                {/* Vaults */}
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--nv-muted)]">
                        Vaults
                      </p>
                      <p className="mt-1 text-xs text-[var(--nv-muted)]">
                        {vaultItems.length} vault{vaultItems.length === 1 ? '' : 's'} available
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSyncAllVaults()}
                      disabled={isSyncing || vaultItems.length === 0}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--nv-foreground)] transition-colors hover:border-[var(--nv-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSyncing ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span>Sync All</span>
                    </button>
                  </div>

                  {isLoadingVaults ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--nv-muted)]">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Loading vaults...</span>
                    </div>
                  ) : vaultItems.length > 0 ? (
                    <div className="space-y-2">
                      {vaultItems.map((vault) => (
                        <div
                          key={vault.vaultId}
                          className="flex flex-col gap-3 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--nv-foreground)]">{vault.label}</p>
                            <p className="mt-1 break-all text-xs leading-5 text-[var(--nv-muted)]">{vault.path}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleSyncVault(vault)}
                            disabled={isSyncing}
                            className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--nv-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSyncing ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            <span>Sync</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--nv-muted)]">No vaults available for sync.</p>
                  )}
                </div>

                {/* Progress / Status */}
                {(syncStatus === 'uploading' || syncStatus === 'downloading') && progress && (
                  <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-4 text-sm text-[var(--nv-muted)]">
                    <div className="flex items-start gap-3">
                      <LoaderCircle className="h-4 w-4 animate-spin text-[var(--nv-secondary)]" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words">{progress}</p>
                        {progressDetails ? (
                          <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--nv-surface)]">
                              <div
                                className="h-full rounded-full bg-[var(--nv-primary)] transition-[width] duration-200"
                                style={{ width: `${progressDetails.percent}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--nv-subtle)]">
                              <span>
                                {formatMegabytes(progressDetails.currentBytes)} / {formatMegabytes(progressDetails.totalBytes)}
                              </span>
                              <span>{Math.round(progressDetails.percent)}%</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {syncStatus === 'done' && (
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3 text-sm text-[var(--nv-secondary)]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Sync Complete</span>
                  </div>
                )}

                {syncStatus === 'error' && errorMessage && (
                  <div className="break-words rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3 text-sm text-[var(--nv-danger)]">
                    Error: {errorMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
