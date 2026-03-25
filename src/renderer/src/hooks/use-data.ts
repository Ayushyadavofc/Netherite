import { useState, useEffect } from 'react'

// Helper to trigger custom event for same-window updates
function setLocalStorage(key: string, value: any) {
  try {
    const stringValue = JSON.stringify(value)
    window.localStorage.setItem(key, stringValue)
    window.dispatchEvent(new Event('local-storage'))
  } catch (error) {
    console.warn(`Error setting localStorage ${key}:`, error)
  }
}

// Generic Hook
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

// --- ACCOUNT DATA REPOSITORIES ---

export interface Profile {
  name: string
  gender: 'male' | 'female'
  dob: string
  email: string
}
export const defaultProfile: Profile = { name: 'Adventurer', gender: 'male', dob: '', email: '' }
export const useProfile = () => useLocalStorage<Profile>('netherite-profile', defaultProfile)

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
  current: string // "YYYY-MM-DD" formatted last login
  count: number
  best: number
}
export const defaultStreak: Streak = { current: '', count: 0, best: 0 }
export const useStreak = () => useLocalStorage<Streak>('netherite-streak', defaultStreak)

// Keep arrays simple
export const useCosmetics = () => useLocalStorage<any[]>('netherite-cosmetics', [])
export const useEquipped = () => useLocalStorage<any[]>('netherite-equipped', [])
export const useScraps = () => useLocalStorage<number>('netherite-scraps', 0)


// --- VAULT DATA REPOSITORIES ---

export function getCurrentVaultId() {
  return window.localStorage.getItem('netherite-current-vault-id') || 'default'
}

export function useVaultKey(suffix: string) {
  const [vaultId, setVaultId] = useState(getCurrentVaultId())

  // Keep vault ID synced if user switches it
  useEffect(() => {
    const handleStorageChange = () => setVaultId(getCurrentVaultId())
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('local-storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('local-storage', handleStorageChange)
    }
  }, [])

  return `netherite-vault-${vaultId}-${suffix}`
}

export interface Habit {
  id: string
  title: string
  description?: string
  difficulty: number // 1-5
  completedDates: string[] // 'YYYY-MM-DD'
  createdAt: number
}
export const useHabits = () => {
  const key = useVaultKey('habits')
  return useLocalStorage<Habit[]>(key, [])
}

export interface Todo {
  id: string
  title: string
  description?: string
  difficulty: number // 1-5
  dueDate: string // 'YYYY-MM-DD'
  completed: boolean
  completedAt?: number
  createdAt: number
}
export const useTodos = () => {
  const key = useVaultKey('todos')
  return useLocalStorage<Todo[]>(key, [])
}

export const useVaultSettings = () => {
  const key = useVaultKey('settings')
  return useLocalStorage<any>(key, {})
}

// Global hook to award or deduct scraps
export function updateScraps(amount: number) {
  const currentStr = window.localStorage.getItem('netherite-scraps')
  const current = currentStr ? parseInt(currentStr, 10) : 0
  const newVal = Math.max(0, current + amount)
  setLocalStorage('netherite-scraps', newVal)
}

export function scrapRewardForDifficulty(stars: number): number {
  switch (stars) {
    case 5: return 55
    case 4: return 35
    case 3: return 20
    case 2: return 10
    case 1: default: return 5
  }
}
