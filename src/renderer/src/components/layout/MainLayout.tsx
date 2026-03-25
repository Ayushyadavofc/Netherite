import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'

export function MainLayout() {
  return (
    <div className="flex flex-col h-full w-full bg-[#0a0808] text-white">
      <TopBar />
      <main className="flex-1 w-full flex relative overflow-hidden">
         <Outlet />
      </main>
    </div>
  )
}
