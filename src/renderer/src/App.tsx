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
import StorePage from './pages/StorePage'
import InventoryPage from './pages/InventoryPage'

import { SplashScreen } from './components/SplashScreen'
import { applyVaultTheme, getCachedVaultConfig, loadVaultConfig } from './lib/vault-config'
import { useAuthStore } from './stores/authStore'
import { useGachaStore } from './stores/gachaStore'
import { useSyncStore } from './stores/syncStore'
import { ACCOUNT_DATA_EVENT, LOCAL_STORAGE_EVENT, type LocalStorageChangeDetail } from './hooks/use-data'
import { CameraModuleStateSync } from './prechaos/CameraModuleStateSync'
import CameraModuleWindowPage from './prechaos/CameraModuleWindowPage'
import { usePreChaosRuntime } from './prechaos/usePreChaosRuntime'

function VaultThemeSync() {
  const isAuthLoading = useAuthStore((state) => state.isLoading)
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')

  useEffect(() => {
    let cancelled = false
    let syncRequestId = 0

    const syncTheme = async () => {
      const currentVaultPath = window.localStorage.getItem('netherite-current-vault-path')
      const requestId = ++syncRequestId

      try {
        const config = await loadVaultConfig(currentVaultPath ?? '')
        if (!cancelled && requestId === syncRequestId) {
          applyVaultTheme(config)
        }
      } catch {
        if (!cancelled && requestId === syncRequestId) {
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
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key && event.key !== 'netherite-current-vault-path') {
        return
      }
      void syncTheme()
    }
    const handleLocalStorageSync = (event: Event) => {
      const detail = (event as CustomEvent<LocalStorageChangeDetail>).detail
      if (detail?.key && detail.key !== 'netherite-current-vault-path') {
        return
      }
      void syncTheme()
    }
    const handleAccountThemeSync = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; filename?: string }>).detail
      if (!detail) {
        void syncTheme()
        return
      }
      if (detail.filename !== '*' && detail.filename !== 'themes') {
        return
      }
      if (detail.userId && detail.userId !== userId && detail.userId !== 'guest') {
        return
      }
      void syncTheme()
    }

    handleThemeSync()
    window.addEventListener('storage', handleStorageSync)
    window.addEventListener(LOCAL_STORAGE_EVENT, handleLocalStorageSync)
    window.addEventListener(ACCOUNT_DATA_EVENT, handleAccountThemeSync)

    return () => {
      cancelled = true
      window.removeEventListener('storage', handleStorageSync)
      window.removeEventListener(LOCAL_STORAGE_EVENT, handleLocalStorageSync)
      window.removeEventListener(ACCOUNT_DATA_EVENT, handleAccountThemeSync)
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

function GachaProfileInit() {
  const isLoading = useAuthStore((state) => state.isLoading)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const syncProfile = useGachaStore((state) => state.syncProfile)

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return
    }

    void syncProfile()
  }, [isAuthenticated, isLoading, syncProfile])

  return null
}

function RendererDiagnostics() {
  useEffect(() => {
    const log = (message: string) => {
      void window.electronAPI.appLog(`renderer: ${message}`)
    }
    const stringifyReason = (reason: unknown) => {
      if (reason instanceof Error) {
        return `${reason.name}: ${reason.message}`
      }
      if (typeof reason === 'string') {
        return reason
      }
      try {
        return JSON.stringify(reason)
      } catch {
        return String(reason)
      }
    }

    const handleError = (event: ErrorEvent) => {
      const details = [event.message, event.filename ? `file=${event.filename}` : '', event.lineno ? `line=${event.lineno}` : '']
        .filter(Boolean)
        .join(' | ')
      log(`window error | route=${window.location.hash || '#/'} | ${details}`)
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      log(`unhandled rejection | route=${window.location.hash || '#/'} | ${stringifyReason(event.reason)}`)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}

function AppContent() {
  const location = useLocation()
  const isCameraModuleRoute = location.pathname === '/camera-module'
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')

  usePreChaosRuntime({ userId, enabled: !isCameraModuleRoute })

  return (
    <>
      <RendererDiagnostics />
      <VaultThemeSync />
      <AuthInit />
      {!isCameraModuleRoute && <VaultServerSyncInit />}
      {!isCameraModuleRoute && <GachaProfileInit />}
      {!isCameraModuleRoute && <SplashScreen />}
      {!isCameraModuleRoute && <CameraModuleStateSync />}
      <div className="flex h-screen min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <Routes location={location}>
            <Route path="/camera-module" element={<CameraModuleWindowPage />} />
            <Route path="/" element={<LandingPage />} />
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/todos" element={<TodosPage />} />
              <Route path="/store" element={<StorePage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
            </Route>
          </Routes>
        </div>
      </div>
    </>
  )
}

export default function App() {
  useEffect(() => {
    const mounted = `[RENDERER][${new Date().toISOString()}] App ROOT MOUNTED`
    console.log(mounted)
    void window.electronAPI.appLog(mounted)

    return () => {
      const unmounted = `[RENDERER][${new Date().toISOString()}] App ROOT UNMOUNTED`
      console.log(unmounted)
      void window.electronAPI.appLog(unmounted)
    }
  }, [])

  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
