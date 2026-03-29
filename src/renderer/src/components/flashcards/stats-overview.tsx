import { Flame, BookOpen, GraduationCap, Clock, Layers, Award } from "lucide-react"

interface StatsOverviewProps {
  todayReview: number
  newCards: number
  learningCards: number
  dueCards: number
  totalCards: number
  mastered: number
  streak: number
}

export function StatsOverview({
  todayReview,
  newCards,
  learningCards,
  dueCards,
  totalCards,
  mastered,
  streak,
}: StatsOverviewProps) {
  return (
    <div className="divide-y divide-[var(--nv-border)] border-y border-[var(--nv-border)]">
      <StatCard
        label="Today's Review"
        value={todayReview}
        icon={<Clock className="w-5 h-5 text-[var(--nv-primary)]" />}
      />
      <StatCard
        label="New Cards"
        value={newCards}
        icon={<Flame className="w-5 h-5 text-[var(--nv-danger)]" />}
      />
      <StatCard
        label="Learning"
        value={learningCards}
        icon={<BookOpen className="w-5 h-5 text-[var(--nv-secondary)]" />}
      />
      <StatCard
        label="Due Cards"
        value={dueCards}
        icon={<Layers className="w-5 h-5 text-[var(--nv-foreground)]" />}
      />
      <StatCard
        label="Total Cards"
        value={totalCards}
        icon={<GraduationCap className="w-5 h-5 text-[var(--nv-muted)]" />}
      />
      <StatCard
        label="Mastered"
        value={mastered}
        icon={<Award className="w-5 h-5 text-[var(--nv-secondary)]" />}
      />
      <StatCard
        label="Day Streak"
        value={streak}
        icon={<Flame className="w-5 h-5 text-[var(--nv-primary)]" />}
      />
    </div>
  )
}

const getFontSize = (n: number) => (n >= 100 ? 'text-2xl' : n >= 10 ? 'text-3xl' : 'text-[2.65rem]')

function StatCard({
  label,
  value,
  icon
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nv-surface)]">
          {icon}
        </div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-[var(--nv-subtle)]">
          {label}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`${getFontSize(value)} font-extrabold leading-none text-[var(--nv-foreground)]`}>{value}</p>
      </div>
    </div>
  )
}
