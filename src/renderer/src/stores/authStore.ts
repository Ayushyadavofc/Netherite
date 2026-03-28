import { useSyncExternalStore } from 'react'
import { ID, Models, Permission, Role } from 'appwrite'

import {
  account,
  databases,
  DATABASE_ID,
  getAppwriteConfigurationError,
  isAppwriteConfigured,
  USER_SETTINGS_COLLECTION_ID
} from '../lib/appwrite'
import { unregisterCurrentDevice } from '../lib/sync-server'

type AuthUser = Models.User<Models.Preferences>
type Gender = 'male' | 'female'

type AuthStore = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    name: string,
    gender?: Gender,
    dob?: string
  ) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

type AuthStoreSelector<T> = (state: AuthStore) => T
type AuthStoreListener = () => void

const listeners = new Set<AuthStoreListener>()
const appwriteConfigError = getAppwriteConfigurationError() ?? 'Auth is not configured yet.'

const assertAppwriteConfigured = () => {
  if (!isAppwriteConfigured()) {
    throw new Error(appwriteConfigError)
  }
}

const isActiveSessionError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  return error.message.toLowerCase().includes('creation of a session is prohibited when a session is active')
}

const isMissingAccountScopeError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return message.includes('missing scopes') || message.includes('role: guests')
}

const emitChange = () => {
  listeners.forEach((listener) => listener())
}

const setState = (partial: Partial<AuthStore>) => {
  state = {
    ...state,
    ...partial
  }
  emitChange()
}

let state: AuthStore = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async (email, password) => {
    assertAppwriteConfigured()
    try {
      await account.createEmailPasswordSession(email, password)
    } catch (error) {
      if (!isActiveSessionError(error)) {
        throw error
      }

      try {
        const existingUser = await account.get()

        if (existingUser.email.toLowerCase() === email.toLowerCase()) {
          setState({
            user: existingUser,
            isAuthenticated: true
          })
          return
        }
      } catch {
        // Fall through to resetting the stale session.
      }

      await account.deleteSession('current')
      await account.createEmailPasswordSession(email, password)
    }

    const user = await account.get()

    setState({
      user,
      isAuthenticated: true
    })
  },
  register: async (email, password, name, gender = 'male', dob = '') => {
    assertAppwriteConfigured()
    await account.create({
      userId: ID.unique(),
      email,
      password,
      name
    })
    await useAuthStore.getState().login(email, password)
    const user = await account.get()
    await databases.createDocument(DATABASE_ID, USER_SETTINGS_COLLECTION_ID, user.$id, {
      gender,
      dob,
      avatar_id: ''
    }, [
      Permission.read(Role.user(user.$id)),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id))
    ])
  },
  logout: async () => {
    const currentUserId = state.user?.$id ?? null

    if (!isAppwriteConfigured()) {
      setState({
        user: null,
        isAuthenticated: false
      })
      return
    }

    try {
      if (currentUserId) {
        await unregisterCurrentDevice(currentUserId).catch(() => undefined)
      }

      await account.deleteSession('current')
    } catch (error) {
      if (!isMissingAccountScopeError(error)) {
        throw error
      }
    }

    setState({
      user: null,
      isAuthenticated: false
    })
  },
  checkAuth: async () => {
    if (!isAppwriteConfigured()) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false
      })
      return
    }

    try {
      const user = await account.get()

      setState({
        user,
        isAuthenticated: true
      })
    } catch {
      setState({
        user: null,
        isAuthenticated: false
      })
    } finally {
      setState({
        isLoading: false
      })
    }
  }
}

const subscribe = (listener: AuthStoreListener) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

type UseAuthStore = {
  <T>(selector: AuthStoreSelector<T>): T
  getState: () => AuthStore
}

const getStateSnapshot = () => state

const useAuthStoreImpl = <T,>(selector: AuthStoreSelector<T>) => {
  const snapshot = useSyncExternalStore(subscribe, getStateSnapshot, getStateSnapshot)

  return selector(snapshot)
}

export const useAuthStore = useAuthStoreImpl as UseAuthStore

useAuthStore.getState = () => state
