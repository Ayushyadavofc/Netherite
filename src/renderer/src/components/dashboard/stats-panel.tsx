import { TrendingUp, Clock, BookOpen, Award } from "lucide-react"

const weeklyData = [
  { day: "Mon", value: 45 },
  { day: "Tue", value: 62 },
  { day: "Wed", value: 38 },
  { day: "Thu", value: 71 },
  { day: "Fri", value: 55 },
  { day: "Sat", value: 80 },
  { day: "Sun", value: 42 },
]

export function StatsPanel() {
  const maxValue = Math.max(...weeklyData.map((d) => d.value))

  return (
    <div className="bg-black border-t border-[#1e1e1e] p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-100">Weekly Progress</h3>
        <div className="flex items-center gap-2 text-emerald-500 text-sm">
          <TrendingUp className="w-4 h-4" />
          <span>+12% from last week</span>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="flex items-end justify-between gap-2 h-32 mb-6">
        {weeklyData.map((item) => (
          <div key={item.day} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full bg-primary/80 rounded-t-sm transition-all duration-300 hover:bg-primary"
              style={{ height: `${(item.value / maxValue) * 100}%` }}
            />
            <span className="text-xs text-zinc-500">{item.day}</span>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          icon={Clock}
          label="Study Time"
          value="4.5 hrs"
          subtext="Today"
        />
        <SummaryCard
          icon={BookOpen}
          label="Cards Reviewed"
          value="127"
          subtext="This week"
        />
        <SummaryCard
          icon={Award}
          label="Accuracy"
          value="89%"
          subtext="Average"
        />
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: typeof Clock
  label: string
  value: string
  subtext: string
}) {
  return (
    <div className="bg-[#0f0f0f] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-500">{subtext}</p>
    </div>
  )
}
