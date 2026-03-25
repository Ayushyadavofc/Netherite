import { HashRouter, Routes, Route } from 'react-router-dom'

import { MainLayout } from './components/layout/MainLayout'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NotesPage from './pages/NotesPage'
import FlashcardsPage from './pages/FlashcardsPage'
import HabitsPage from './pages/HabitsPage'
import TodosPage from './pages/TodosPage'

import { SplashScreen } from './components/SplashScreen'

export default function App() {
  return (
    <HashRouter>
      <SplashScreen />
      <div className="flex flex-col h-screen">
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/todos" element={<TodosPage />} />
            </Route>
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
