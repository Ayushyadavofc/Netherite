import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'

import { SyncStatusModal } from './components/SyncStatusModal'
import { MainLayout } from './components/layout/MainLayout'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NotesPage from './pages/NotesPage'
import FlashcardsPage from './pages/FlashcardsPage'
import HabitsPage from './pages/HabitsPage'
import TodosPage from './pages/TodosPage'

import { SplashScreen } from './components/SplashScreen'
import { applyVaultTheme, getCachedVaultConfig, loadVaultConfig } from './lib/vault-config'
import { useAuthStore } from './stores/authStore'
import { useSyncStore } from './stores/syncStore'

function VaultThemeSync() {
  const isAuthLoading = useAuthStore((state) => state.isLoading)
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')

  useEffect(() => {
    let cancelled = false

    const syncTheme = async () => {
      const currentVaultPath = window.localStorage.getItem('netherite-current-vault-path')

      try {
        const config = await loadVaultConfig(currentVaultPath ?? '')
        if (!cancelled) {
          applyVaultTheme(config)
        }
      } catch {
        if (!cancelled) {
          applyVaultTheme(getCachedVaultConfig())
        }
      }
    }

    if (isAuthLoading) {
      return
    }

    const handleThemeSync = () => {
      void syncTheme()
    }

    handleThemeSync()
    window.addEventListener('storage', handleThemeSync)
    window.addEventListener('local-storage', handleThemeSync)

    return () => {
      cancelled = true
      window.removeEventListener('storage', handleThemeSync)
      window.removeEventListener('local-storage', handleThemeSync)
    }
  }, [isAuthLoading, userId])

  return null
}

function AuthInit() {
  const checkAuth = useAuthStore((state) => state.checkAuth)

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  return null
}

function VaultServerSyncInit() {
  const isLoading = useAuthStore((state) => state.isLoading)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userId = useAuthStore((state) => state.user?.$id ?? null)
  const reconcileServerVaults = useSyncStore((state) => state.reconcileServerVaults)

  useEffect(() => {
    if (isLoading || !isAuthenticated || !userId) {
      return
    }

    void reconcileServerVaults()
  }, [isAuthenticated, isLoading, reconcileServerVaults, userId])

  return null
}

export default function App() {
  return (
    <HashRouter>
      <VaultThemeSync />
      <AuthInit />
      <VaultServerSyncInit />
      <SyncStatusModal />
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
