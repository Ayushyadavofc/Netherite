import { useEffect, useMemo, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { GachaChest, GachaCosmetic, GachaReward } from '../../../../shared/gacha'

type ChestOpeningModalProps = {
  chest: GachaChest | null
  cosmetics: GachaCosmetic[]
  open: boolean
  rewards: GachaReward[]
  unlocked: string[]
  onClose: () => void
}

type RevealPhase = 'charging' | 'revealed'

export function ChestOpeningModal({ chest, cosmetics, open, rewards, unlocked, onClose }: ChestOpeningModalProps) {
  const [phase, setPhase] = useState<RevealPhase>('charging')

  const cosmeticsById = useMemo(
    () => Object.fromEntries(cosmetics.map((cosmetic) => [cosmetic.id, cosmetic])),
    [cosmetics]
  )

  useEffect(() => {
    if (!open) {
      setPhase('charging')
      return
    }

    const timeout = window.setTimeout(() => setPhase('revealed'), 700)
    return () => window.clearTimeout(timeout)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl border-[var(--nv-border)] bg-[var(--nv-surface-strong)] p-0 text-[var(--nv-foreground)]">
        <div className="border-b border-[var(--nv-border)] bg-[radial-gradient(circle_at_top,rgba(255,106,0,0.18),transparent_55%),linear-gradient(135deg,rgba(28,20,18,0.98),rgba(14,10,10,0.96))] px-6 py-6">
          <DialogTitle className="text-xl font-black uppercase tracking-[0.26em] text-[var(--nv-secondary)]">
            {chest?.name ?? 'Chest'} Results
          </DialogTitle>
          <DialogDescription className="mt-2 text-[var(--nv-muted)]">
            {phase === 'charging' ? 'Decrypting shard signatures...' : 'Rewards received and inventory updated on the server.'}
          </DialogDescription>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--nv-primary)]/40 bg-black/30 p-8">
            <div
              className={`mx-auto flex h-32 w-32 items-center justify-center rounded-[2rem] border text-center transition-all duration-700 ${
                phase === 'charging'
                  ? 'scale-95 border-[var(--nv-border)] bg-[rgba(255,255,255,0.03)] text-[var(--nv-muted)]'
                  : 'scale-100 border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-secondary)] shadow-[0_0_40px_rgba(255,106,0,0.18)]'
              }`}
            >
              <span className="text-xs font-black uppercase tracking-[0.34em]">
                {phase === 'charging' ? 'Opening' : chest?.name ?? 'Chest'}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          {phase === 'charging' ? (
            <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-5 py-4 text-sm text-[var(--nv-muted)]">
              Rolling weighted rewards and applying duplicate protection...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rewards.map((reward) => {
                const cosmetic = cosmeticsById[reward.cosmeticId]
                const wasUnlocked = unlocked.includes(reward.cosmeticId)
                return (
                  <div
                    key={reward.cosmeticId}
                    className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
                  >
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.28em] text-[var(--nv-muted)]">
                      {cosmetic?.rarity ?? 'reward'}
                    </p>
                    <h3 className="mt-2 text-lg font-black text-white">{cosmetic?.name ?? reward.cosmeticId}</h3>
                    <p className="mt-3 text-sm font-semibold text-[var(--nv-secondary)]">+{reward.pieces} pieces</p>
                    {wasUnlocked && (
                      <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--nv-primary)]">
                        Cosmetic unlocked
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[var(--nv-secondary)] transition-colors hover:bg-[var(--nv-secondary)] hover:text-[var(--nv-bg)]"
            >
              Continue
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
