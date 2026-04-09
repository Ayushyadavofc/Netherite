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
import { executeOpenChest, getGachaConfigurationError, listGachaChests, listGachaCosmetics, syncGachaProfile } from '@/lib/gacha-client'
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
}

const assertAuthenticated = () => {
  const user = useAuthStore.getState().user
  if (!user) {
    throw new Error('Sign in to use the gacha system.')
  }
}

export const useGachaStore = create<GachaStore>((set, get) => ({
  chests: [],
  cosmetics: [],
  inventory: null,
  wallet: null,
  streak: null,
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
    assertAuthenticated()
    set({ isProfileLoading: true, error: null })
    try {
      const profile = await syncGachaProfile()
      set({
        wallet: profile.wallet,
        inventory: profile.inventory,
        streak: profile.streak,
        isProfileLoading: false
      })
    } catch (error) {
      set({
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
      const nextWallet = get().wallet ?? {
        scraps: 0,
        gems: 0,
        bonusChests: {} as BonusChestLedger
      }

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
  clearLastOpenResult: () => set({ lastOpenResult: null })
}))
