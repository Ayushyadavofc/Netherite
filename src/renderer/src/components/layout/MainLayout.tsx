import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'

export function MainLayout() {
  return (
    <div className="flex h-full w-full flex-col bg-[var(--nv-bg)] text-[var(--nv-foreground)]">
      <TopBar />
      <main className="flex-1 w-full flex relative overflow-hidden">
         <Outlet />
      </main>
    </div>
  )
}
