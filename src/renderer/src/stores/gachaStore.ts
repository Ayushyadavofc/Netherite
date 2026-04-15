import { Permission, Query, Role } from 'appwrite'
import { create } from 'zustand'

import type {
  BonusChestLedger,
  GachaChest,
  GachaCosmetic,
  GachaInventory,
  GachaPaymentMode,
  GachaReward,
  GachaStreakState,
  GachaWallet
} from '../../../shared/gacha'
import {
  databases,
  DATABASE_ID,
  GACHA_INVENTORY_COLLECTION_ID,
  GACHA_USERS_COLLECTION_ID,
  USER_SETTINGS_COLLECTION_ID
} from '@/lib/appwrite'
import { defaultProfile, readAccountDataFile, writeAccountDataFile, type Profile } from '@/hooks/use-data'
import { executeOpenChest, getGachaConfigurationError, listGachaChests, listGachaCosmetics, syncGachaProfile } from '@/lib/gacha-client'
import { resolveCharacterId, type CharacterGender } from '@/lib/characters'
import { useAuthStore } from '@/stores/authStore'

type OpenChestResult = {
  rewards: GachaReward[]
  unlocked: string[]
  chestId: string
  paymentMode: GachaPaymentMode
}

type GachaStore = {
  chests: GachaChest[]
  cosmetics: GachaCosmetic[]
  inventory: GachaInventory | null
  wallet: GachaWallet | null
  streak: GachaStreakState | null
  selectedCharacter: string | null
  lastOpenResult: OpenChestResult | null
  isCatalogLoading: boolean
  isProfileLoading: boolean
  isOpeningChest: boolean
  error: string | null
  loadCatalog: () => Promise<void>
  syncProfile: () => Promise<void>
  fetchInventory: () => Promise<void>
  fetchCurrency: () => Promise<void>
  openChest: (chestId: string, paymentMode: GachaPaymentMode) => Promise<OpenChestResult>
  clearLastOpenResult: () => void
  updateSelectedCharacter: (characterId: string) => Promise<void>
  changeSelectedCharacter: (characterId: string) => Promise<void>
}

type UserSettingsDocument = {
  gender?: string
}

type GachaUserDocument = {
  $id: string
  userId: string
  scraps?: number
  gems?: number
  selectedCharacter?: string | null
  currentStreak?: number
  bonusChests?: string
}

const assertAuthenticated = () => {
  const user = useAuthStore.getState().user
  if (!user) {
    throw new Error('Sign in to use the gacha system.')
  }
}

const normalizeGender = (value?: string): CharacterGender => (value === 'female' ? 'female' : 'male')

const getTodayKey = (date = new Date()) => date.toISOString().slice(0, 10)

const isMissingSelectedCharacterAttributeError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('unknown attribute') && message.includes('selectedcharacter')
}

const readStoredProfile = async (userId: string) =>
  readAccountDataFile<Profile>(userId, 'settings', defaultProfile)

const readStoredSelectedCharacter = async (userId: string, gender: CharacterGender) => {
  const profile = await readStoredProfile(userId)
  return resolveCharacterId(profile.selectedCharacter, profile.gender ?? gender)
}

const persistSelectedCharacterLocally = async (userId: string, characterId: string, gender: CharacterGender) => {
  const profile = await readStoredProfile(userId)
  await writeAccountDataFile(userId, 'settings', {
    ...profile,
    gender: profile.gender ?? gender,
    selectedCharacter: characterId
  })
}

const getAuthenticatedUser = () => {
  assertAuthenticated()
  const user = useAuthStore.getState().user
  if (!user) {
    throw new Error('Sign in to use the gacha system.')
  }

  return user
}

const createDefaultWallet = (): GachaWallet => ({
  scraps: 0,
  gems: 0,
  bonusChests: {} as BonusChestLedger
})

const createEmptyInventory = (): GachaInventory => ({
  items: {},
  unlocked: []
})

const createResetStreak = (): GachaStreakState => ({
  currentStreak: 0,
  lastActiveDate: getTodayKey(),
  nextChestAt: null
})

const getUserGender = async (userId: string): Promise<CharacterGender> => {
  try {
    const settingsDocument = (await databases.getDocument(
      DATABASE_ID,
      USER_SETTINGS_COLLECTION_ID,
      userId
    )) as UserSettingsDocument

    return normalizeGender(settingsDocument.gender)
  } catch {
    return 'male'
  }
}

const ensureGachaUserDocument = async (userId: string, selectedCharacter?: string) => {
  try {
    return (await databases.getDocument(
      DATABASE_ID,
      GACHA_USERS_COLLECTION_ID,
      userId
    )) as GachaUserDocument
  } catch (error) {
    const code = (error as Error & { code?: number }).code
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (code !== 404 && !message.includes('not found')) {
      throw error
    }

    return (await databases.createDocument(
      DATABASE_ID,
      GACHA_USERS_COLLECTION_ID,
      userId,
      {
        userId,
        scraps: 0,
        gems: 0,
        createdAt: new Date().toISOString(),
        selectedCharacter: selectedCharacter ?? 'swordsman',
        currentStreak: 0,
        bonusChests: '{}'
      },
      [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId))
      ]
    )) as GachaUserDocument
  }
}

export const useGachaStore = create<GachaStore>((set, get) => ({
  chests: [],
  cosmetics: [],
  inventory: null,
  wallet: null,
  streak: null,
  selectedCharacter: null,
  lastOpenResult: null,
  isCatalogLoading: false,
  isProfileLoading: false,
  isOpeningChest: false,
  error: getGachaConfigurationError(),
  loadCatalog: async () => {
    set({ isCatalogLoading: true, error: null })
    try {
      const [chests, cosmetics] = await Promise.all([listGachaChests(), listGachaCosmetics()])
      set({ chests, cosmetics, isCatalogLoading: false })
    } catch (error) {
      set({
        isCatalogLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load the gacha catalog.'
      })
    }
  },
  syncProfile: async () => {
    const user = getAuthenticatedUser()

    set({ isProfileLoading: true, error: null })

    try {
      const [profile, gender] = await Promise.all([syncGachaProfile(), getUserGender(user.$id)])
      const localSelectedCharacter = await readStoredSelectedCharacter(user.$id, gender)
      const resolvedSelectedCharacter = profile.selectedCharacter
        ? resolveCharacterId(profile.selectedCharacter, gender)
        : localSelectedCharacter

      set({
        wallet: profile.wallet,
        inventory: profile.inventory,
        streak: profile.streak,
        selectedCharacter: resolvedSelectedCharacter,
        isProfileLoading: false
      })
    } catch (error) {
      console.error('Sync profile error:', error)
      const gender = await getUserGender(user.$id).catch(() => 'male' as CharacterGender)
      const localSelectedCharacter = await readStoredSelectedCharacter(user.$id, gender).catch(() => 'swordsman')
      set({
        selectedCharacter: localSelectedCharacter,
        isProfileLoading: false,
        error: error instanceof Error ? error.message : 'Unable to sync your gacha profile.'
      })
    }
  },
  fetchInventory: async () => {
    await get().syncProfile()
  },
  fetchCurrency: async () => {
    await get().syncProfile()
  },
  openChest: async (chestId, paymentMode) => {
    assertAuthenticated()
    set({ isOpeningChest: true, error: null })

    try {
      const result = await executeOpenChest({ chestId, paymentMode })
      const nextWallet = get().wallet ?? createDefaultWallet()

      const nextOpenResult: OpenChestResult = {
        rewards: result.rewards,
        unlocked: result.unlocked,
        chestId,
        paymentMode
      }

      set({
        wallet: {
          ...nextWallet,
          scraps: result.remainingScraps,
          bonusChests: result.bonusChests
        },
        inventory: result.inventory,
        lastOpenResult: nextOpenResult,
        isOpeningChest: false
      })

      return nextOpenResult
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this chest.'
      set({
        isOpeningChest: false,
        error: message
      })
      throw new Error(message)
    }
  },
  clearLastOpenResult: () => set({ lastOpenResult: null }),
  updateSelectedCharacter: async (characterId: string) => {
    const user = getAuthenticatedUser()
    const gender = await getUserGender(user.$id)
    const resolvedCharacterId = resolveCharacterId(characterId, gender)

    try {
      await ensureGachaUserDocument(user.$id, resolvedCharacterId)
      await databases.updateDocument(DATABASE_ID, GACHA_USERS_COLLECTION_ID, user.$id, {
        selectedCharacter: resolvedCharacterId
      })
      await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
      set({ selectedCharacter: resolvedCharacterId })
    } catch (error) {
      if (isMissingSelectedCharacterAttributeError(error)) {
        await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
        set({ selectedCharacter: resolvedCharacterId })
        return
      }
      console.error('Failed to update selected character', error)
      throw new Error('Unable to update selected character. Check Appwrite sync.')
    }
  },
  changeSelectedCharacter: async (characterId: string) => {
    const user = getAuthenticatedUser()
    const gender = await getUserGender(user.$id)
    const resolvedCharacterId = resolveCharacterId(characterId, gender)
    const currentCharacterId = resolveCharacterId(get().selectedCharacter, gender)

    if (currentCharacterId === resolvedCharacterId) {
      set({ selectedCharacter: resolvedCharacterId })
      return
    }

    try {
      const userDocument = await ensureGachaUserDocument(user.$id, currentCharacterId)
      const hasStats =
        (userDocument.scraps ?? 0) > 0 ||
        (userDocument.gems ?? 0) > 0 ||
        (userDocument.currentStreak ?? 0) > 0

      if (!hasStats) {
        await databases.updateDocument(DATABASE_ID, GACHA_USERS_COLLECTION_ID, user.$id, {
          selectedCharacter: resolvedCharacterId
        })
        await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
        set({ selectedCharacter: resolvedCharacterId })
        return
      }

      try {
        await databases.updateDocument(DATABASE_ID, GACHA_USERS_COLLECTION_ID, user.$id, {
          selectedCharacter: resolvedCharacterId
        })
      } catch (error) {
        if (isMissingSelectedCharacterAttributeError(error)) {
          await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
          set({ selectedCharacter: resolvedCharacterId })
          return
        }

        throw error
      }

      const inventoryDocuments = await databases.listDocuments({
        databaseId: DATABASE_ID,
        collectionId: GACHA_INVENTORY_COLLECTION_ID,
        queries: [Query.equal('userId', user.$id), Query.limit(100)]
      })

      await Promise.all(
        inventoryDocuments.documents.map((document) =>
          databases.deleteDocument(DATABASE_ID, GACHA_INVENTORY_COLLECTION_ID, document.$id)
        )
      )

      await databases.updateDocument(DATABASE_ID, GACHA_USERS_COLLECTION_ID, user.$id, {
        scraps: 0,
        gems: 0,
        currentStreak: 0,
        lastActiveDate: getTodayKey(),
        nextChestAt: null,
        bonusChests: '{}'
      })

      set({
        selectedCharacter: resolvedCharacterId,
        wallet: createDefaultWallet(),
        inventory: createEmptyInventory(),
        streak: createResetStreak()
      })
      await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
    } catch (error) {
      if (isMissingSelectedCharacterAttributeError(error)) {
        await persistSelectedCharacterLocally(user.$id, resolvedCharacterId, gender)
        set({ selectedCharacter: resolvedCharacterId })
        return
      }
      console.error('Failed to change selected character', error)
      throw new Error('Unable to change your character right now.')
    }
  }
}))
