import { STREAK_CHEST_MILESTONES, type ChestId } from '../../../../shared/gacha'

type StreakCalendarStripProps = {
  currentStreak: number
  title?: string
  subtitle?: string
  className?: string
  compact?: boolean
  tall?: boolean
}

const buildDayCells = (currentStreak: number, totalDays: number) => {
  const cells: { label: string; iso: string; streakDay: number }[] = []
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Anchor to 14 days ago to maintain some history
  const anchor = new Date(today)
  anchor.setDate(anchor.getDate() - 14)
  
  // Align to Monday
  const day = anchor.getDay()
  const diff = anchor.getDate() - day + (day === 0 ? -6 : 1)
  anchor.setDate(diff)
  
  const streakStart = new Date(today)
  streakStart.setDate(streakStart.getDate() - currentStreak + 1)
  
  for (let offset = 0; offset < totalDays; offset += 1) {
    const next = new Date(anchor)
    next.setDate(anchor.getDate() + offset)
    
    const diffTime = next.getTime() - streakStart.getTime()
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24))
    const streakDay = diffDays >= 0 ? diffDays + 1 : -1
    
    cells.push({
      label: next.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1).toUpperCase(),
      iso: next.toISOString().slice(0, 10),
      streakDay
    })
  }

  return { cells, todayIso: today.toISOString().slice(0, 10) }
}

const chestTierTone: Record<ChestId, string> = {
  bronze: '#8B5E3C',
  silver: '#5B9BD5',
  epic: '#B07FD4'
}

const chestTierLabel: Record<ChestId, string> = {
  bronze: 'Bronze Chest',
  silver: 'Silver Chest',
  epic: 'Epic Chest'
}

function MilestoneChestIcon({ chestId, compact }: { chestId: ChestId; compact?: boolean }) {
  const tone = chestTierTone[chestId] ?? chestTierTone.bronze

  return (
    <svg viewBox="0 0 24 24" className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-9" />
      <path d="M4 10c0 -3 3 -5 8 -5s8 2 8 5" />
      <path d="M3 10h18" />
      <path d="M12 10v3" strokeWidth="2.5" />
    </svg>
  )
}

export function StreakCalendarStrip({
  currentStreak,
  title = 'STREAK REWARDS',
  subtitle = 'Keep the chain alive to unlock chest rewards.',
  className = '',
  compact = false,
  tall = false
}: StreakCalendarStripProps) {
  const totalDays = 35
  const { cells: dayCells, todayIso } = buildDayCells(currentStreak, totalDays)

  return (
    <section className={`rounded-[12px] border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] ${className}`}>
      <div className={`${compact ? 'px-3 py-3' : 'px-5 py-5'} ${tall ? 'flex h-full flex-col' : ''}`}>
        <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
          <div>
            <p className={`font-black tracking-[0.24em] text-[var(--nv-primary)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{title}</p>
            <p className={`mt-1 text-[var(--nv-muted)] ${compact ? 'text-[10px]' : 'text-xs'}`}>{subtitle}</p>
          </div>
          <div
            className={`shrink-0 rounded-full bg-[var(--nv-primary)] font-black uppercase tracking-[0.18em] text-[var(--nv-primary-contrast)] ${compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'}`}
          >
            {currentStreak} DAY STREAK
          </div>
        </div>

        <div className={`grid grid-cols-7 justify-items-center ${compact ? 'gap-1.5' : 'gap-2'} ${tall ? 'flex-1 content-start' : ''}`}>
          {dayCells.map((cell) => {
            const milestone = STREAK_CHEST_MILESTONES.find((item) => item.day === cell.streakDay)
            const isActive = cell.streakDay > 0 && cell.streakDay <= currentStreak
            const isToday = cell.iso === todayIso
            const daysUntilUnlock = milestone ? Math.max(milestone.day - currentStreak, 0) : null
            const tooltipTitle = milestone ? chestTierLabel[milestone.chestId] : null
            const tooltipTitleColor = milestone ? chestTierTone[milestone.chestId] : undefined
            const tooltipMessage = milestone
              ? daysUntilUnlock === 0
                ? currentStreak >= milestone.day
                  ? 'Unlocked'
                  : 'Unlocks today'
                : `${daysUntilUnlock} ${daysUntilUnlock === 1 ? 'day' : 'days'} to unlock`
              : null
            const tooltipText = tooltipTitle && tooltipMessage ? `${tooltipTitle} - ${tooltipMessage}` : undefined

            return (
              <div
                key={cell.iso}
                title={tooltipText}
                className={`group relative flex w-full flex-col items-center justify-start rounded-[6px] border ${
                  isActive
                    ? 'border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]'
                    : isToday
                    ? 'border-[var(--nv-secondary)] bg-[var(--nv-surface)]'
                    : 'border-[var(--nv-border)] bg-[var(--nv-surface)]'
                } ${milestone ? 'cursor-help' : ''} ${compact ? 'h-[44px] max-w-[32px] pt-1' : 'h-[50px] max-w-[40px] pt-1.5'}`}
              >
                <div className={`leading-none text-center ${compact ? 'mb-[1px]' : 'mb-1'}`}>
                  <div className={`font-black tracking-[0.16em] ${compact ? 'text-[6px]' : 'text-[7px]'} ${isActive ? 'text-[var(--nv-primary)]' : 'text-[var(--nv-subtle)]'}`}>
                    {cell.label}
                  </div>
                  <div className={`mt-[1px] font-black ${compact ? 'text-[10px]' : 'text-[11px]'} ${isActive ? 'text-[var(--nv-foreground)]' : 'text-[var(--nv-muted)]'}`}>
                    {new Date(cell.iso).getDate()}
                  </div>
                </div>
                {milestone ? (
                  <>
                    <div className={`flex-1 flex items-end ${compact ? 'pb-1' : 'pb-1.5'}`}>
                      <MilestoneChestIcon chestId={milestone.chestId} compact={compact} />
                    </div>
                    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-max max-w-[180px] -translate-x-1/2 rounded-[10px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2 text-center shadow-[0_12px_30px_rgba(0,0,0,0.35)] group-hover:block">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: tooltipTitleColor }}>{tooltipTitle}</div>
                      <div className="mt-1 text-[10px] text-[var(--nv-muted)]">{tooltipMessage}</div>
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
