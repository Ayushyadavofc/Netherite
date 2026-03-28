import { useCallback, useEffect, useRef, useState } from 'react'

import { defaultVaultConfig } from '@/lib/vault-config'
import { useAuthStore } from '@/stores/authStore'

const ACCOUNT_DATA_EVENT = 'account-data-changed'
const migratedUsers = new Map<string, Promise<void>>()
const DEVICE_VAULT_PATHS_KEY = 'netherite-device-vault-paths'
const DEVICE_VAULT_SNAPSHOT_KEY = 'netherite-device-vault-snapshots'
const DEVICE_LAST_VAULT_KEY = 'netherite-device-last-vault'
const LEGACY_ACCOUNT_FILE_KEYS: Record<string, string> = {
  habits: 'netherite-habits',
  todos: 'netherite-todos',
  themes: 'netherite-themes',
  settings: 'netherite-profile',
  vaults: 'netherite-vaults'
}

const defaultThemeSettings = {
  preset: defaultVaultConfig.theme.preset,
  customAccent: defaultVaultConfig.theme.customAccent,
  customPalette: { ...defaultVaultConfig.theme.customPalette }
} satisfies Record<string, unknown>

function setLocalStorage(key: string, value: unknown) {
  try {
    const stringValue = JSON.stringify(value)
    window.localStorage.setItem(key, stringValue)
    window.dispatchEvent(new Event('local-storage'))
  } catch (error) {
    console.warn(`Error setting localStorage ${key}:`, error)
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.warn(`Error reading localStorage ${key}:`, error)
      return initialValue
    }
  })

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const item = window.localStorage.getItem(key)
        if (item) {
          setStoredValue(JSON.parse(item))
        }
      } catch (error) {
        console.warn(`Error updating from localStorage ${key}:`, error)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('local-storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('local-storage', handleStorageChange)
    }
  }, [key])

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      setLocalStorage(key, valueToStore)
    } catch (error) {
      console.warn(`Error setting localStorage ${key}:`, error)
    }
  }

  return [storedValue, setValue]
}

export const getActiveAccountId = () => useAuthStore.getState().user?.$id ?? 'guest'

const emitAccountDataChange = (userId: string, filename: string) => {
  window.dispatchEvent(
    new CustomEvent(ACCOUNT_DATA_EVENT, {
      detail: { userId, filename }
    })
  )
}

export const ensureGuestMigration = async (userId: string) => {
  if (!userId || userId === 'guest') {
    return
  }

  const existing = migratedUsers.get(userId)
  if (existing) {
    await existing
    return
  }

  const nextPromise = window.electronAPI
    .migrateGuestData(userId)
    .then(() => {
      emitAccountDataChange(userId, '*')
    })
    .finally(() => {
      migratedUsers.delete(userId)
    })

  migratedUsers.set(userId, nextPromise)
  await nextPromise
}

export const readAccountDataFile = async <T,>(userId: string, filename: string, fallback: T) => {
  const item = await window.electronAPI.readAccountFile<T>(userId, filename)
  return item ?? fallback
}

export const writeAccountDataFile = async <T,>(userId: string, filename: string, data: T) => {
  const saved = await window.electronAPI.writeAccountFile(userId, filename, data)
  emitAccountDataChange(userId, filename)
  return saved
}

const readLegacyAccountValue = <T,>(filename: string): T | null => {
  const legacyKey = LEGACY_ACCOUNT_FILE_KEYS[filename]
  if (!legacyKey) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(legacyKey)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (error) {
    console.warn(`Error reading legacy localStorage ${legacyKey}:`, error)
    return null
  }
}

const migrateLegacyAccountValue = async <T,>(
  userId: string,
  filename: string,
  fallback: T,
  options?: { persistFallback?: boolean }
) => {
  const existing = await window.electronAPI.readAccountFile<T>(userId, filename)
  if (existing !== null) {
    return existing
  }

  const legacyValue = readLegacyAccountValue<T>(filename)
  if (legacyValue === null) {
    if (options?.persistFallback) {
      await writeAccountDataFile(userId, filename, fallback)
    }
    return fallback
  }

  await writeAccountDataFile(userId, filename, legacyValue)
  return legacyValue
}

function useAccountFile<T>(
  filename: string,
  initialValue: T,
  options?: { persistInitialValueOnMissing?: boolean }
): [T, (value: T | ((val: T) => T)) => void] {
  const userId = useAuthStore((state) => state.user?.$id ?? 'guest')
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const valueRef = useRef(storedValue)

  useEffect(() => {
    valueRef.current = storedValue
  }, [storedValue])

  const loadValue = useCallback(async () => {
    if (userId !== 'guest') {
      await ensureGuestMigration(userId)
    }

    try {
      const nextValue = await migrateLegacyAccountValue(userId, filename, initialValue, {
        persistFallback: options?.persistInitialValueOnMissing
      })
      setStoredValue(nextValue)
    } catch (error) {
      console.warn(`Error loading account file ${filename}:`, error)
      setStoredValue(initialValue)
    }
  }, [filename, initialValue, options?.persistInitialValueOnMissing, userId])

  useEffect(() => {
    void loadValue()
  }, [loadValue])

  useEffect(() => {
    const handleAccountDataChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; filename?: string }>).detail
      if (!detail) {
        void loadValue()
        return
      }

      if (detail.filename !== '*' && detail.filename !== filename) {
        return
      }

      if (detail.userId && detail.userId !== userId && detail.userId !== 'guest') {
        return
      }

      void loadValue()
    }

    window.addEventListener(ACCOUNT_DATA_EVENT, handleAccountDataChange)

    return () => {
      window.removeEventListener(ACCOUNT_DATA_EVENT, handleAccountDataChange)
    }
  }, [filename, loadValue, userId])

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      void (async () => {
        try {
          const currentValue = valueRef.current
          const valueToStore = value instanceof Function ? value(currentValue) : value
          setStoredValue(valueToStore)
          valueRef.current = valueToStore
          await writeAccountDataFile(userId, filename, valueToStore)
        } catch (error) {
          console.warn(`Error writing account file ${filename}:`, error)
        }
      })()
    },
    [filename, userId]
  )

  return [storedValue, setValue]
}

export interface Profile {
  name: string
  gender: 'male' | 'female'
  dob: string
  email: string
  avatarId: string
}
export const defaultProfile: Profile = {
  name: 'Adventurer',
  gender: 'male',
  dob: '',
  email: '',
  avatarId: ''
}
export const useProfile = () =>
  useAccountFile<Profile>('settings', defaultProfile, {
    persistInitialValueOnMissing: true
  })

export interface Stats {
  str: number
  int: number
  end: number
  xp: number
  level: number
}
export const defaultStats: Stats = { str: 0, int: 0, end: 0, xp: 0, level: 1 }
export const useStats = () => useLocalStorage<Stats>('netherite-stats', defaultStats)

export interface Streak {
  current: string
  count: number
  best: number
}
export const defaultStreak: Streak = { current: '', count: 0, best: 0 }
export const useStreak = () => useLocalStorage<Streak>('netherite-streak', defaultStreak)

export const useCosmetics = () => useLocalStorage<any[]>('netherite-cosmetics', [])
export const useEquipped = () => useLocalStorage<any[]>('netherite-equipped', [])
export const useScraps = () => useLocalStorage<number>('netherite-scraps', 0)

export function getCurrentVaultId() {
  return window.localStorage.getItem('netherite-current-vault-id') || 'default'
}

export interface Habit {
  id: string
  title: string
  description?: string
  difficulty: number
  completedDates: string[]
  createdAt: number
}

export interface Todo {
  id: string
  title: string
  description?: string
  difficulty: number
  dueDate: string
  completed: boolean
  completedAt?: number
  createdAt: number
}

export type StoredVaultEntry = {
  name: string
  lastOpened: string
  vaultId?: string
  path?: string
}

type DeviceVaultRecord = {
  vaultId?: string
  name?: string
  path: string
}

type DeviceVaultSnapshotRecord = {
  snapshotAt?: string
  snapshotName?: string
}

const readDeviceVaultPathMap = () => {
  try {
    const raw = window.localStorage.getItem(DEVICE_VAULT_PATHS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const writeDeviceVaultPathMap = (nextMap: Record<string, string>) => {
  window.localStorage.setItem(DEVICE_VAULT_PATHS_KEY, JSON.stringify(nextMap))
}

const readDeviceVaultSnapshotMap = () => {
  try {
    const raw = window.localStorage.getItem(DEVICE_VAULT_SNAPSHOT_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, DeviceVaultSnapshotRecord>)
      : {}
  } catch {
    return {}
  }
}

const writeDeviceVaultSnapshotMap = (nextMap: Record<string, DeviceVaultSnapshotRecord>) => {
  window.localStorage.setItem(DEVICE_VAULT_SNAPSHOT_KEY, JSON.stringify(nextMap))
}

export const getDeviceVaultPath = (vaultId?: string | null, legacyPath?: string | null) => {
  if (vaultId) {
    const pathMap = readDeviceVaultPathMap()
    const storedPath = pathMap[vaultId]
    if (storedPath) {
      return storedPath
    }
  }

  return legacyPath ?? null
}

export const setDeviceVaultPath = (vaultId: string, path: string) => {
  const pathMap = readDeviceVaultPathMap()
  pathMap[vaultId] = path
  writeDeviceVaultPathMap(pathMap)
}

export const removeDeviceVaultPath = (vaultId?: string | null) => {
  if (!vaultId) {
    return
  }

  const pathMap = readDeviceVaultPathMap()
  if (!(vaultId in pathMap)) {
    return
  }

  delete pathMap[vaultId]
  writeDeviceVaultPathMap(pathMap)
}

export const getDeviceVaultSnapshot = (vaultId?: string | null) => {
  if (!vaultId) {
    return null
  }

  const snapshotMap = readDeviceVaultSnapshotMap()
  return snapshotMap[vaultId] ?? null
}

export const setDeviceVaultSnapshot = (
  vaultId: string,
  snapshot: { snapshotAt?: string | null; snapshotName?: string | null }
) => {
  const snapshotMap = readDeviceVaultSnapshotMap()
  snapshotMap[vaultId] = {
    snapshotAt: snapshot.snapshotAt ?? undefined,
    snapshotName: snapshot.snapshotName ?? undefined
  }
  writeDeviceVaultSnapshotMap(snapshotMap)
}

export const removeDeviceVaultSnapshot = (vaultId?: string | null) => {
  if (!vaultId) {
    return
  }

  const snapshotMap = readDeviceVaultSnapshotMap()
  if (!(vaultId in snapshotMap)) {
    return
  }

  delete snapshotMap[vaultId]
  writeDeviceVaultSnapshotMap(snapshotMap)
}

export const getLastDeviceVault = (): DeviceVaultRecord | null => {
  try {
    const raw = window.localStorage.getItem(DEVICE_LAST_VAULT_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<DeviceVaultRecord>
    return typeof parsed.path === 'string' && parsed.path
      ? {
          path: parsed.path,
          vaultId: typeof parsed.vaultId === 'string' ? parsed.vaultId : undefined,
          name: typeof parsed.name === 'string' ? parsed.name : undefined
        }
      : null
  } catch {
    return null
  }
}

export const setLastDeviceVault = (record: DeviceVaultRecord | null) => {
  if (!record) {
    window.localStorage.removeItem(DEVICE_LAST_VAULT_KEY)
    return
  }

  window.localStorage.setItem(DEVICE_LAST_VAULT_KEY, JSON.stringify(record))
}

export const rememberDeviceVault = (vaultId: string | undefined, name: string, path: string) => {
  if (vaultId) {
    setDeviceVaultPath(vaultId, path)
  }

  setLastDeviceVault({
    vaultId,
    name,
    path
  })
}

export const useHabits = () => useAccountFile<Habit[]>('habits', [])
export const useTodos = () => useAccountFile<Todo[]>('todos', [])
export const useVaultSettings = () =>
  useAccountFile<Record<string, unknown>>('themes', defaultThemeSettings, {
    persistInitialValueOnMissing: true
  })

export function updateScraps(amount: number) {
  const currentStr = window.localStorage.getItem('netherite-scraps')
  const current = currentStr ? parseInt(currentStr, 10) : 0
  const newVal = Math.max(0, current + amount)
  setLocalStorage('netherite-scraps', newVal)
}

export function scrapRewardForDifficulty(stars: number): number {
  switch (stars) {
    case 5:
      return 55
    case 4:
      return 35
    case 3:
      return 20
    case 2:
      return 10
    case 1:
    default:
      return 5
  }
}
