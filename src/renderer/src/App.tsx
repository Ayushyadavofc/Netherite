import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'

import { MainLayout } from './components/layout/MainLayout'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NotesPage from './pages/NotesPage'
import FlashcardsPage from './pages/FlashcardsPage'
import HabitsPage from './pages/HabitsPage'
import TodosPage from './pages/TodosPage'
import AnalyticsPage from './pages/AnalyticsPage'

import { SplashScreen } from './components/SplashScreen'
import { applyVaultTheme, getCachedVaultConfig, loadVaultConfig } from './lib/vault-config'
import { useAuthStore } from './stores/authStore'
import { useSyncStore } from './stores/syncStore'
import { CameraModuleStateSync } from './prechaos/CameraModuleStateSync'
import CameraModuleWindowPage from './prechaos/CameraModuleWindowPage'
import { usePreChaosRuntime } from './prechaos/usePreChaosRuntime'

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

function AppContent() {
  const location = useLocation()
  const isCameraModuleRoute = location.pathname === '/camera-module'
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')
  usePreChaosRuntime({ userId, enabled: !isCameraModuleRoute })

  return (
    <>
      <VaultThemeSync />
      <AuthInit />
      {!isCameraModuleRoute && <VaultServerSyncInit />}
      {!isCameraModuleRoute && <SplashScreen />}
      {!isCameraModuleRoute && <CameraModuleStateSync />}
      <div className="flex h-screen min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <Routes>
            <Route path="/camera-module" element={<CameraModuleWindowPage />} />
            <Route path="/" element={<LandingPage />} />
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/todos" element={<TodosPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
            </Route>
          </Routes>
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
