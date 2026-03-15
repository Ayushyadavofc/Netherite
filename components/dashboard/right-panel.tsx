"use client"

import { Flame, ShoppingBag, Lock, Sparkles } from "lucide-react"

const equippedCosmetics = [
  { name: "Iron Helmet", rarity: "Common", slot: "Head" },
  { name: "Scholar's Robe", rarity: "Rare", slot: "Body" },
  { name: "Amber Blade", rarity: "Epic", slot: "Weapon" },
]

const nextUnlocks = [
  { name: "Dragon Scale Armor", rarity: "Epic", progress: 3, total: 5, type: "habits" },
  { name: "Mage's Staff", rarity: "Rare", progress: 7, total: 10, type: "flashcards" },
  { name: "Golden Crown", rarity: "Legendary", progress: 1, total: 7, type: "notes" },
]

const rarityColors: Record<string, { bg: string; text: string; border: string }> = {
  Common: { bg: "bg-zinc-700/50", text: "text-zinc-300", border: "border-zinc-600" },
  Rare: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  Epic: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  Legendary: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
}

export function RightPanel() {
  return (
    <aside className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-auto">
      {/* XP Bar Section */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-zinc-950 font-bold text-sm">12</span>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Level 12</p>
              <p className="text-xs text-zinc-500">Knowledge Seeker</p>
            </div>
          </div>
          <span className="text-xs text-zinc-400">2,450 / 3,000 XP</span>
        </div>
        <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
            style={{ width: "82%" }}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-1.5">550 XP to Level 13</p>
      </div>

      {/* Streak Section */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-100">12</p>
              <p className="text-xs text-zinc-500">Day Streak</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-orange-500">On Fire!</p>
            <p className="text-xs text-zinc-500">Best: 23 days</p>
          </div>
        </div>
      </div>

      {/* Equipped Cosmetics */}
      <div className="p-4 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Equipped Cosmetics</h3>
        <div className="space-y-2">
          {equippedCosmetics.map((item) => {
            const rarity = rarityColors[item.rarity]
            return (
              <div
                key={item.name}
                className={`flex items-center justify-between p-2.5 rounded-lg ${rarity.bg} border ${rarity.border}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center">
                    <Sparkles className={`w-4 h-4 ${rarity.text}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.slot}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${rarity.bg} ${rarity.text}`}>
                  {item.rarity}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Visit Shop Button */}
      <div className="p-4 border-b border-zinc-800">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-semibold rounded-lg hover:from-amber-400 hover:to-orange-400 transition-all">
          <ShoppingBag className="w-5 h-5" />
          <span>Visit Shop</span>
        </button>
      </div>

      {/* Next Unlocks Section */}
      <div className="p-4 flex-1">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Next Unlocks</h3>
        <div className="space-y-3">
          {nextUnlocks.map((item) => {
            const rarity = rarityColors[item.rarity]
            const remaining = item.total - item.progress
            const percentage = (item.progress / item.total) * 100
            return (
              <div
                key={item.name}
                className="p-3 bg-zinc-800/50 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-100">{item.name}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${rarity.bg} ${rarity.text}`}>
                    {item.rarity}
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.rarity === "Legendary"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500"
                        : item.rarity === "Epic"
                        ? "bg-gradient-to-r from-purple-500 to-pink-500"
                        : "bg-gradient-to-r from-blue-500 to-cyan-500"
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  {remaining} more {item.type} to unlock
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
