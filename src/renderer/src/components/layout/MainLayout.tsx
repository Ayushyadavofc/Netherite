import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'

export function MainLayout() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      <TopBar />
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
         <Outlet />
      </main>
    </div>
  )
}
