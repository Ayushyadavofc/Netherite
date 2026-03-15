"use client"

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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <StatCard
        icon={Clock}
        label="Today's Review"
        value={todayReview}
        color="amber"
      />
      <StatCard
        icon={BookOpen}
        label="New Cards"
        value={newCards}
        color="blue"
      />
      <StatCard
        icon={GraduationCap}
        label="Learning"
        value={learningCards}
        color="purple"
      />
      <StatCard
        icon={Flame}
        label="Due Cards"
        value={dueCards}
        color="rose"
      />
      <StatCard
        icon={Layers}
        label="Total Cards"
        value={totalCards}
        color="zinc"
      />
      <StatCard
        icon={Award}
        label="Mastered"
        value={mastered}
        color="emerald"
      />
      <StatCard
        icon={Flame}
        label="Day Streak"
        value={streak}
        color="orange"
        highlight
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: typeof Clock
  label: string
  value: number
  color: "amber" | "blue" | "purple" | "rose" | "zinc" | "emerald" | "orange"
  highlight?: boolean
}) {
  const colorClasses = {
    amber: "text-amber-500 bg-amber-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    purple: "text-purple-500 bg-purple-500/10",
    rose: "text-rose-500 bg-rose-500/10",
    zinc: "text-zinc-400 bg-zinc-800",
    emerald: "text-emerald-500 bg-emerald-500/10",
    orange: "text-orange-500 bg-orange-500/10",
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  )
}
