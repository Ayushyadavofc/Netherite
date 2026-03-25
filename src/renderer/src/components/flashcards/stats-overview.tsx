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
    <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
      <StatCard
        label="Today's Review"
        value={todayReview}
        icon={<Clock className="w-5 h-5 text-[#ff5625]" />}
      />
      <StatCard
        label="New Cards"
        value={newCards}
        icon={<Flame className="w-5 h-5 text-[#ff5449]" />}
      />
      <StatCard
        label="Learning"
        value={learningCards}
        icon={<BookOpen className="w-5 h-5 text-[#ffb77d]" />}
      />
      <StatCard
        label="Due Cards"
        value={dueCards}
        icon={<Layers className="w-5 h-5 text-white" />}
      />
      <StatCard
        label="Total Cards"
        value={totalCards}
        icon={<GraduationCap className="w-5 h-5 text-[#a8a0a0]" />}
      />
      <StatCard
        label="Mastered"
        value={mastered}
        icon={<Award className="w-5 h-5 text-[#ffb77d]" />}
      />
      <StatCard
        label="Day Streak"
        value={streak}
        icon={<Flame className="w-5 h-5 text-[#ff5625]" />}
      />
    </div>
  )
}

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
    <div className="rounded-[8px] border border-[#1f1d1d] bg-[#111111] p-6 flex flex-col justify-between relative overflow-hidden group hover:border-[#2a2422] transition-colors">
      <div className="absolute right-4 top-4 opacity-30 group-hover:opacity-100 transition-opacity duration-300">
        {icon}
      </div>
      <p className="text-4xl font-extrabold text-white mb-2 relative z-10">{value}</p>
      <div className="flex items-center gap-2 relative z-10 mt-1">
        <p className="text-[0.6rem] uppercase tracking-[0.3em] font-bold text-[#444444] group-hover:text-[#a8a0a0] transition-colors">{label}</p>
      </div>
    </div>
  )
}
