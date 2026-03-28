import { LoaderCircle } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useSyncStore } from '@/stores/syncStore'

export function SyncStatusModal() {
  const isSyncing = useSyncStore((state) => state.isSyncing)
  const isSyncModalOpen = useSyncStore((state) => state.isSyncModalOpen)
  const syncStatus = useSyncStore((state) => state.syncStatus)
  const progress = useSyncStore((state) => state.progress)
  const progressDetails = useSyncStore((state) => state.progressDetails)

  if (isSyncModalOpen || !isSyncing || (syncStatus !== 'downloading' && syncStatus !== 'uploading')) {
    return null
  }

  const normalizedProgress = progress.toLowerCase()
  const title =
    syncStatus === 'uploading'
      ? 'Syncing Data'
      : normalizedProgress.includes('checking for updates')
        ? 'Checking Vault Updates'
        : 'Restoring Vault'

  const formatMegabytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md border-[var(--nv-border)] bg-[var(--nv-surface-strong)] text-[var(--nv-foreground)]"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--nv-secondary)]" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold text-[var(--nv-secondary)]">{title}</DialogTitle>
            <DialogDescription className="text-[var(--nv-muted)]">
              {progress || 'Please wait...'}
            </DialogDescription>
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
      </DialogContent>
    </Dialog>
  )
}
