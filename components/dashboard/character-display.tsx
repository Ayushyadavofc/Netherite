"use client"

import { useState } from "react"

export function CharacterDisplay() {
  const [gender, setGender] = useState<"male" | "female">("male")

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-zinc-900/50 to-zinc-950 relative">
      {/* Gender Toggle - Top Right */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
        <button
          onClick={() => setGender("male")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            gender === "male"
              ? "bg-amber-500 text-zinc-950"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Male
        </button>
        <button
          onClick={() => setGender("female")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            gender === "female"
              ? "bg-amber-500 text-zinc-950"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Female
        </button>
      </div>

      {/* Pixel Art Character */}
      <div className="mb-6 relative">
        {/* Character Display Area */}
        <div className="w-48 h-64 relative flex items-end justify-center">
          {/* Ground Shadow */}
          <div className="absolute bottom-0 w-24 h-4 bg-zinc-800/50 rounded-full blur-sm" />
          
          {/* Pixel Art Character SVG */}
          <svg
            viewBox="0 0 32 48"
            className="w-44 h-60 drop-shadow-2xl"
            style={{ imageRendering: "pixelated" }}
          >
            {/* Helmet/Head */}
            <rect x="10" y="2" width="12" height="3" fill="#71717a" /> {/* Helmet top */}
            <rect x="8" y="5" width="16" height="2" fill="#52525b" /> {/* Helmet rim */}
            <rect x="9" y="7" width="14" height="8" fill="#3f3f46" /> {/* Helmet body */}
            <rect x="11" y="9" width="4" height="3" fill="#27272a" /> {/* Visor left */}
            <rect x="17" y="9" width="4" height="3" fill="#27272a" /> {/* Visor right */}
            <rect x="15" y="10" width="2" height="2" fill="#52525b" /> {/* Nose guard */}
            
            {/* Neck */}
            <rect x="12" y="15" width="8" height="2" fill="#a1a1aa" />
            
            {/* Pauldrons */}
            <rect x="4" y="17" width="6" height="4" fill="#71717a" />
            <rect x="22" y="17" width="6" height="4" fill="#71717a" />
            <rect x="5" y="18" width="4" height="2" fill="#f59e0b" /> {/* Amber accent left */}
            <rect x="23" y="18" width="4" height="2" fill="#f59e0b" /> {/* Amber accent right */}
            
            {/* Chest Armor */}
            <rect x="10" y="17" width="12" height="10" fill="#52525b" />
            <rect x="13" y="18" width="6" height="4" fill="#f59e0b" /> {/* Chest emblem */}
            <rect x="14" y="19" width="4" height="2" fill="#d97706" /> {/* Emblem detail */}
            <rect x="11" y="23" width="10" height="3" fill="#3f3f46" /> {/* Belt area */}
            <rect x="14" y="24" width="4" height="1" fill="#f59e0b" /> {/* Belt buckle */}
            
            {/* Arms */}
            <rect x="5" y="21" width="5" height="8" fill="#3f3f46" /> {/* Left arm */}
            <rect x="22" y="21" width="5" height="8" fill="#3f3f46" /> {/* Right arm */}
            <rect x="4" y="29" width="4" height="3" fill="#71717a" /> {/* Left gauntlet */}
            <rect x="24" y="29" width="4" height="3" fill="#71717a" /> {/* Right gauntlet */}
            
            {/* Weapon - Sword on back */}
            <rect x="26" y="8" width="2" height="16" fill="#a1a1aa" /> {/* Blade */}
            <rect x="25" y="24" width="4" height="3" fill="#78350f" /> {/* Handle */}
            <rect x="24" y="23" width="6" height="1" fill="#f59e0b" /> {/* Crossguard */}
            
            {/* Legs */}
            <rect x="11" y="27" width="4" height="10" fill="#27272a" /> {/* Left leg */}
            <rect x="17" y="27" width="4" height="10" fill="#27272a" /> {/* Right leg */}
            <rect x="11" y="34" width="4" height="3" fill="#52525b" /> {/* Left knee */}
            <rect x="17" y="34" width="4" height="3" fill="#52525b" /> {/* Right knee */}
            
            {/* Boots */}
            <rect x="10" y="37" width="5" height="4" fill="#3f3f46" /> {/* Left boot */}
            <rect x="17" y="37" width="5" height="4" fill="#3f3f46" /> {/* Right boot */}
            <rect x="10" y="40" width="6" height="2" fill="#27272a" /> {/* Left sole */}
            <rect x="16" y="40" width="6" height="2" fill="#27272a" /> {/* Right sole */}
            
            {/* Cape hint */}
            <rect x="8" y="17" width="2" height="15" fill="#78350f" opacity="0.8" />
            <rect x="6" y="20" width="2" height="10" fill="#78350f" opacity="0.6" />
          </svg>
        </div>
      </div>

      {/* Character Name & Class */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-zinc-100 mb-1">Ayush</h2>
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
          <span className="text-amber-500 text-sm font-medium">Scholar</span>
        </span>
      </div>

      {/* Stat Bars - STR, INT, END */}
      <div className="w-full max-w-md grid grid-cols-3 gap-6">
        <StatBar label="STR" value={45} maxValue={100} color="red" />
        <StatBar label="INT" value={78} maxValue={100} color="blue" />
        <StatBar label="END" value={62} maxValue={100} color="green" />
      </div>
    </div>
  )
}

function StatBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string
  value: number
  maxValue: number
  color: "red" | "blue" | "green"
}) {
  const colorClasses = {
    red: {
      bg: "bg-red-500/20",
      fill: "bg-gradient-to-r from-red-600 to-red-500",
      text: "text-red-400",
    },
    blue: {
      bg: "bg-blue-500/20",
      fill: "bg-gradient-to-r from-blue-600 to-blue-500",
      text: "text-blue-400",
    },
    green: {
      bg: "bg-emerald-500/20",
      fill: "bg-gradient-to-r from-emerald-600 to-emerald-500",
      text: "text-emerald-400",
    },
  }

  const styles = colorClasses[color]
  const percentage = (value / maxValue) * 100

  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-bold ${styles.text} mb-2`}>{label}</span>
      <div className={`w-full h-3 ${styles.bg} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${styles.fill} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 mt-1">{value}</span>
    </div>
  )
}
