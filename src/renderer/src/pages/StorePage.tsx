import { useEffect, useMemo } from 'react'

import { StreakCalendarStrip } from '@/components/gacha/StreakCalendarStrip'
import { ChestOpeningModal } from '@/components/gacha/ChestOpeningModal'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { useAuthStore } from '@/stores/authStore'
import { useGachaStore } from '@/stores/gachaStore'

const tierBadgeTone: Record<string, string> = {
  bronze: 'border-[#8B5E3C] bg-[rgba(139,94,60,0.12)] text-[#8B5E3C]',
  silver: 'border-[#5B9BD5] bg-[rgba(91,155,213,0.12)] text-[#5B9BD5]',
  epic: 'border-[#B07FD4] bg-[rgba(176,127,212,0.14)] text-[#B07FD4]'
}

function TreasureChestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M3 10V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V10" />
      <path d="M3 10C3 6.6863 6.35786 5 12 5C17.6421 5 21 6.6863 21 10" />
      <path d="M21 10H3" />
      <rect x="10" y="8" width="4" height="4" rx="1" />
      <path d="M12 12V14" />
    </svg>
  )
}

export default function StorePage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const chests = useGachaStore((state) => state.chests)
  const cosmetics = useGachaStore((state) => state.cosmetics)
  const wallet = useGachaStore((state) => state.wallet)
  const streak = useGachaStore((state) => state.streak)
  const error = useGachaStore((state) => state.error)
  const lastOpenResult = useGachaStore((state) => state.lastOpenResult)
  const isCatalogLoading = useGachaStore((state) => state.isCatalogLoading)
  const isProfileLoading = useGachaStore((state) => state.isProfileLoading)
  const isOpeningChest = useGachaStore((state) => state.isOpeningChest)
  const loadCatalog = useGachaStore((state) => state.loadCatalog)
  const syncProfile = useGachaStore((state) => state.syncProfile)
  const openChest = useGachaStore((state) => state.openChest)
  const clearLastOpenResult = useGachaStore((state) => state.clearLastOpenResult)

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    void syncProfile()
  }, [isAuthenticated, syncProfile])

  const activeChest = useMemo(
    () => chests.find((chest) => chest.id === lastOpenResult?.chestId) ?? null,
    [chests, lastOpenResult?.chestId]
  )

  return (
    <div className="h-full overflow-y-auto bg-[var(--nv-bg)] px-4 py-6 text-white no-scrollbar sm:px-6 xl:px-8 2xl:px-10">
      <div className="mx-auto flex w-full max-w-full flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <section className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--nv-primary)]">CHEST STORE</p>
                <h1 className="mt-3 text-[30px] font-black leading-tight text-white">Open chests. Build your collection.</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--nv-muted)]">
                  Spend scraps, keep your streak alive, and turn every chest into progress toward a full cosmetic set.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
                <div className="rounded-[10px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--nv-subtle)]">SCRAPS</p>
                  <div className="mt-2 flex items-center gap-2">
                    <NetheriteScrapIcon size={16} />
                    <span className="text-2xl font-black text-[var(--nv-primary)]">{wallet?.scraps ?? 0}</span>
                  </div>
                </div>
                <div className="rounded-[10px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--nv-subtle)]">STREAK</p>
                  <div className="mt-2 text-2xl font-black text-[var(--nv-secondary)]">{streak?.currentStreak ?? 0}</div>
                </div>
              </div>
            </div>
          </section>

          {!isAuthenticated ? (
            <div className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-sm text-[var(--nv-muted)]">
              Sign in to sync your scraps, streak rewards, and chest inventory.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[12px] border border-[var(--nv-danger-soft)] bg-[var(--nv-surface)] px-4 py-3 text-sm text-[var(--nv-primary)]">
              {error}
            </div>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--nv-primary)]">CHESTS</p>
                <h2 className="mt-2 text-[24px] font-black text-white">Choose a chest tier and open it.</h2>
              </div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--nv-subtle)]">{chests.length} available</p>
            </div>

            <div className="grid min-w-0 gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {chests.map((chest) => {
              const freeCount = wallet?.bonusChests?.[chest.id] ?? 0
              const canAfford = (wallet?.scraps ?? 0) >= chest.cost
              const paymentMode = freeCount > 0 ? 'bonus' : 'scraps'
              const canOpen = isAuthenticated && (freeCount > 0 || canAfford)

              return (
                <article key={chest.id} className="overflow-hidden rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)]">
                  <div className="border-b border-[var(--nv-border)] p-4">
                    <div className="relative aspect-video min-h-[140px] overflow-hidden rounded-[10px] border border-dashed border-[var(--nv-border)] bg-[var(--nv-bg)]">
                      <div className="absolute inset-0 flex items-center justify-center">
                        {chest.id === 'bronze' ? (
                          <img src="/chest-bronze.png" alt="Bronze Chest" className="h-full max-h-[120px] w-auto object-contain" />
                        ) : chest.id === 'silver' ? (
                          <img src="/chest-silver.png" alt="Silver Chest" className="h-full max-h-[120px] w-auto object-contain" />
                        ) : (
                          <img src="/chest-epic.png" alt="Epic Chest" className="h-full max-h-[120px] w-auto object-contain" />
                        )}
                      </div>
                      <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${tierBadgeTone[chest.id] ?? tierBadgeTone.bronze}`}>
                        {chest.id}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div>
                      <h3 className={`text-base font-black ${
                        chest.id === 'bronze' ? 'text-[#8B5E3C]' : 
                        chest.id === 'silver' ? 'text-[#5B9BD5]' : 
                        chest.id === 'epic' ? 'text-[#B07FD4]' : 'text-white'
                      }`}>{chest.name}</h3>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--nv-muted)]">{chest.piecesPerOpen} pieces per open</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(chest.rarityWeights).map(([rarity, weight]) => (
                        <div key={rarity} className="rounded-[8px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2 py-2 text-center">
                          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[var(--nv-subtle)]">{rarity}</p>
                          <p className="mt-1 text-xs font-black text-white">{weight}%</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">PRICE</p>
                        <p className="mt-1 text-sm font-black text-[var(--nv-primary)]">{freeCount > 0 ? 'FREE' : `${chest.cost} scraps`}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!canOpen || isOpeningChest || isCatalogLoading || isProfileLoading}
                        onClick={() => void openChest(chest.id, paymentMode)}
                        className={`rounded-[10px] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                          canOpen
                            ? 'bg-[var(--nv-primary)] text-white hover:bg-[var(--nv-secondary)]'
                            : 'bg-[var(--nv-bg)] text-[var(--nv-muted)]'
                        }`}
                      >
                        {freeCount > 0 ? `Open Free (${freeCount})` : canAfford ? 'Open Chest' : 'Need Scraps'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
            </div>
          </section>
        </div>

        <aside className="mt-5 w-full min-w-0 xl:mt-0 xl:h-full xl:w-[clamp(300px,21vw,390px)] xl:shrink-0">
          <StreakCalendarStrip
            currentStreak={streak?.currentStreak ?? 0}
            title="STREAK REWARDS"
            subtitle="Milestone markers show where your next reward chest lands."
            tall
            className="xl:sticky xl:top-8 xl:h-[calc(100vh-96px)] xl:min-h-[680px]"
          />
        </aside>
      </div>

      <ChestOpeningModal
        chest={activeChest}
        cosmetics={cosmetics}
        open={Boolean(lastOpenResult)}
        rewards={lastOpenResult?.rewards ?? []}
        unlocked={lastOpenResult?.unlocked ?? []}
        onClose={clearLastOpenResult}
      />
    </div>
  )
}
