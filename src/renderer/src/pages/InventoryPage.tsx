import { useEffect, useMemo, useState } from 'react'
import { Shirt } from 'lucide-react'

import { PixelCharacter } from '@/components/dashboard/PixelCharacter'
import { NetheriteScrapIcon } from '@/components/ui/NetheriteScrapIcon'
import { useProfile, useScraps, useStats } from '@/hooks/use-data'
import { useAuthStore } from '@/stores/authStore'
import { useGachaStore } from '@/stores/gachaStore'

type CosmeticFilter = 'all' | 'unlocked' | 'progress' | 'common' | 'rare' | 'epic'

const filterTabs: { id: CosmeticFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'unlocked', label: 'UNLOCKED' },
  { id: 'progress', label: 'IN PROGRESS' },
  { id: 'common', label: 'COMMON' },
  { id: 'rare', label: 'RARE' },
  { id: 'epic', label: 'EPIC' }
]

const rarityTone = {
  common: 'border-[#29432e] bg-[rgba(111,191,115,0.14)] text-[#6fbf73]',
  rare: 'border-[#243154] bg-[rgba(122,162,255,0.14)] text-[#7aa2ff]',
  epic: 'border-[#392754] bg-[rgba(184,147,255,0.14)] text-[#b893ff]'
} as const

const formatCosmeticType = (id: string) => {
  const parts = id.split('_')
  const label = parts[parts.length - 1] ?? id
  return label.toUpperCase()
}

export default function InventoryPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const cosmetics = useGachaStore((state) => state.cosmetics)
  const inventory = useGachaStore((state) => state.inventory)
  const wallet = useGachaStore((state) => state.wallet)
  const error = useGachaStore((state) => state.error)
  const isCatalogLoading = useGachaStore((state) => state.isCatalogLoading)
  const isProfileLoading = useGachaStore((state) => state.isProfileLoading)
  const loadCatalog = useGachaStore((state) => state.loadCatalog)
  const fetchInventory = useGachaStore((state) => state.fetchInventory)
  const [profile] = useProfile()
  const [storedStats] = useStats()
  const [storedScraps] = useScraps()
  const [activeFilter, setActiveFilter] = useState<CosmeticFilter>('all')
  const [previewName, setPreviewName] = useState<string | null>(null)

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    void fetchInventory()
  }, [fetchInventory, isAuthenticated])

  const unlockedSet = useMemo(() => new Set(inventory?.unlocked ?? []), [inventory?.unlocked])
  const level = Math.max(storedStats.level || 1, Math.floor(Math.sqrt((wallet?.scraps ?? storedScraps) / 100)) + 1)
  const xp = storedStats.xp || wallet?.scraps || storedScraps
  const xpCap = Math.max(level * 120, 120)
  const xpPct = Math.min(100, (xp / xpCap) * 100)
  const scraps = wallet?.scraps ?? storedScraps

  const statCards = [
    { label: 'STR', value: storedStats.str || 12, color: '#f43f5e' },
    { label: 'HP', value: storedStats.end || 26, color: '#22c55e' },
    { label: 'MAG', value: Math.max(1, Math.round((storedStats.int || 14) * 0.8)), color: '#3b82f6' },
    { label: 'INT', value: storedStats.int || 18, color: '#a855f7' }
  ].map((stat) => ({
    ...stat,
    width: `${Math.min(100, Math.max(15, (stat.value / 40) * 100))}%`
  }))

  const filteredCosmetics = useMemo(() => {
    return cosmetics.filter((cosmetic) => {
      const isUnlocked = unlockedSet.has(cosmetic.id)

      switch (activeFilter) {
        case 'unlocked':
          return isUnlocked
        case 'progress':
          return !isUnlocked
        case 'common':
        case 'rare':
        case 'epic':
          return cosmetic.rarity === activeFilter
        default:
          return true
      }
    })
  }, [activeFilter, cosmetics, unlockedSet])

  const nextUnlocks = useMemo(
    () =>
      cosmetics
        .filter((cosmetic) => !unlockedSet.has(cosmetic.id))
        .map((cosmetic) => {
          const ownedPieces = inventory?.items?.[cosmetic.id] ?? 0
          return {
            ...cosmetic,
            ownedPieces,
            remainingPieces: Math.max(0, cosmetic.totalPieces - ownedPieces)
          }
        })
        .sort((left, right) => left.remainingPieces - right.remainingPieces || right.ownedPieces - left.ownedPieces)
        .slice(0, 4),
    [cosmetics, inventory?.items, unlockedSet]
  )

  return (
    <div className="h-full overflow-y-auto bg-[var(--nv-bg)] px-4 py-6 text-white no-scrollbar sm:px-6 xl:px-8 2xl:px-10">
      <div className="mx-auto w-full max-w-[min(1920px,calc(100vw-32px))] space-y-5 sm:max-w-[min(1920px,calc(100vw-48px))] 2xl:max-w-[min(2160px,calc(100vw-80px))]">
        {!isAuthenticated ? (
          <div className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-sm text-[var(--nv-muted)]">
            Sign in to view and sync your cosmetic inventory.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[12px] border border-[var(--nv-danger-soft)] bg-[var(--nv-surface)] px-4 py-3 text-sm text-[var(--nv-primary)]">
            {error}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-8 xl:w-[clamp(280px,24vw,430px)] xl:shrink-0 xl:self-start">
            <section className="overflow-hidden rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)]">
              <div className="bg-transparent">
                <div className="relative min-h-[220px] overflow-hidden sm:min-h-[260px]">
                  <div className="flex h-full min-h-[220px] w-full min-w-0 items-end justify-center overflow-hidden p-4 sm:min-h-[260px]">
                    <div className="flex h-full w-full max-h-full max-w-full items-end justify-center overflow-hidden">
                      <div className="aspect-square h-full w-full max-h-full max-w-[min(100%,320px)] overflow-hidden">
                        <PixelCharacter gender={profile.gender} />
                      </div>
                    </div>
                  </div>
                  {previewName ? (
                    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 rounded-full border border-[var(--nv-secondary)] bg-[var(--nv-secondary-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-secondary)] whitespace-nowrap">
                      PREVIEW: {previewName}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-2">
                  {statCards.map((stat) => (
                    <div key={stat.label} className="rounded-[8px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">{stat.label}</span>
                        <span className="text-[10px] font-black" style={{ color: stat.color }}>{stat.value}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--nv-border)]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: stat.width, backgroundColor: stat.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[8px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-primary)]">
                        LVL
                      </span>
                      <span className="text-sm font-black text-white">Level {level}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--nv-muted)]">{xp}/{xpCap}</span>
                  </div>
                  <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[var(--nv-border)]">
                    <div className="h-full rounded-full bg-[var(--nv-primary)]" style={{ width: `${xpPct}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[8px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--nv-muted)]">SCRAPS</span>
                  <div className="flex items-center gap-2">
                    <NetheriteScrapIcon size={15} />
                    <span className="text-base font-black text-white">{scraps}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--nv-primary)]">NEXT UNLOCKS</p>
              <div className="mt-3 space-y-2.5">
                {nextUnlocks.map((cosmetic) => (
                  <div key={cosmetic.id} className="rounded-[8px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{cosmetic.name}</p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--nv-subtle)]">{formatCosmeticType(cosmetic.id)}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] ${rarityTone[cosmetic.rarity]}`}>
                        {cosmetic.rarity}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--nv-muted)]">{cosmetic.remainingPieces} pieces left</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="min-w-0 flex-1 space-y-5">
            <section className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--nv-primary)]">COSMETIC INVENTORY</p>
                  <h1 className="mt-3 text-[30px] font-black leading-tight text-white">Track pieces and preview your next unlock.</h1>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:min-w-[260px]">
                  <div className="rounded-[10px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">UNLOCKED</p>
                    <p className="mt-2 text-2xl font-black text-[var(--nv-primary)]">{unlockedSet.size}</p>
                  </div>
                  <div className="rounded-[10px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">IN PROGRESS</p>
                    <p className="mt-2 text-2xl font-black text-[var(--nv-secondary)]">{Math.max(0, cosmetics.length - unlockedSet.size)}</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              <p className="text-sm text-[var(--nv-muted)]">Hover any cosmetic to preview it on your character</p>

              <div className="flex flex-wrap gap-2">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`rounded-full border px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                      activeFilter === tab.id
                        ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]'
                        : 'border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-muted)] hover:border-[var(--nv-secondary)] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] 2xl:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {filteredCosmetics.map((cosmetic) => {
                  const ownedPieces = inventory?.items?.[cosmetic.id] ?? 0
                  const isUnlocked = unlockedSet.has(cosmetic.id)
                  const progressPct = isUnlocked ? 100 : Math.min(100, (ownedPieces / cosmetic.totalPieces) * 100)

                  return (
                    <article
                      key={cosmetic.id}
                      onMouseEnter={() => setPreviewName(cosmetic.name)}
                      onMouseLeave={() => setPreviewName(null)}
                      className={`rounded-[12px] border bg-[var(--nv-surface)] p-3.5 transition-colors ${
                        isUnlocked ? 'border-[#1e2e1e]' : 'border-[var(--nv-border)] hover:border-[var(--nv-secondary)]'
                      }`}
                    >
                      <div className="relative overflow-hidden rounded-[10px] border border-dashed border-[var(--nv-border)] bg-[var(--nv-bg)]">
                        <div className="aspect-square flex items-center justify-center">
                          <div className="text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[10px] border border-dashed border-[var(--nv-border)]">
                              <Shirt className="h-5 w-5 text-[var(--nv-subtle)]" />
                            </div>
                            <p className="mt-2 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">SPRITE</p>
                          </div>
                        </div>
                        <span className={`absolute left-3 top-3 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${rarityTone[cosmetic.rarity]}`}>
                          {cosmetic.rarity}
                        </span>
                        {isUnlocked ? (
                          <span className="absolute right-3 top-3 rounded-full border border-[#29432e] bg-[rgba(111,191,115,0.14)] px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#6fbf73]">
                            UNLOCKED
                          </span>
                        ) : (
                          <span className={`absolute right-3 top-3 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${
                            ownedPieces > 0
                              ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]'
                              : 'border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-muted)]'
                          }`}>
                            {ownedPieces}/{cosmetic.totalPieces}
                          </span>
                        )}
                      </div>

                      <div className="mt-3">
                        <h3 className="text-[13px] font-black text-white">{cosmetic.name}</h3>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--nv-subtle)]">{formatCosmeticType(cosmetic.id)}</p>
                        <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-[var(--nv-border)]">
                          <div className={`h-full rounded-full ${isUnlocked ? 'bg-[#6fbf73]' : 'bg-[var(--nv-primary)]'}`} style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              {!filteredCosmetics.length ? (
                <div className="rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface)] px-4 py-3 text-sm text-[var(--nv-muted)]">
                  {isProfileLoading || isCatalogLoading ? 'Loading cosmetics...' : 'No cosmetics match this filter yet.'}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
