import { Sidebar } from "@/components/dashboard/sidebar"
import { CharacterDisplay } from "@/components/dashboard/character-display"
import { RightPanel } from "@/components/dashboard/right-panel"

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Center Column - Character Display */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <CharacterDisplay />
      </main>

      {/* Right Panel */}
      <RightPanel />
    </div>
  )
}
