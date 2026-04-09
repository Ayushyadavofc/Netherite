export type CosmeticRarity = 'common' | 'rare' | 'epic'
export type ChestId = 'bronze' | 'silver' | 'epic'
export type GachaPaymentMode = 'scraps' | 'bonus'

export const COSMETIC_TOTAL_PIECES = 6

export const SCRAP_REWARD_BY_DIFFICULTY = {
  easy: 5,
  medium: 20,
  hard: 50
} as const

export const CHEST_COSTS: Record<ChestId, number> = {
  bronze: 100,
  silver: 300,
  epic: 800
}

export const DEFAULT_CHEST_PIECES_PER_OPEN: Record<ChestId, number> = {
  bronze: 2,
  silver: 4,
  epic: 8
}

export const DEFAULT_RARITY_WEIGHTS: Record<ChestId, Record<CosmeticRarity, number>> = {
  bronze: { common: 78, rare: 20, epic: 2 },
  silver: { common: 35, rare: 52, epic: 13 },
  epic: { common: 10, rare: 45, epic: 45 }
}

export const STREAK_CHEST_MILESTONES = [
  { day: 3, chestId: 'bronze' },
  { day: 7, chestId: 'bronze' },
  { day: 14, chestId: 'silver' },
  { day: 30, chestId: 'epic' }
] as const satisfies ReadonlyArray<{ day: number; chestId: ChestId }>

export const RARITY_ORDER: CosmeticRarity[] = ['common', 'rare', 'epic']

export type BonusChestLedger = Record<string, number>
export type InventoryPieceMap = Record<string, number>

export interface GachaCosmetic {
  id: string
  name: string
  rarity: CosmeticRarity
  totalPieces: number
}

export interface GachaChest {
  id: ChestId | string
  name: string
  cost: number
  rarityWeights: Record<CosmeticRarity, number>
  piecesPerOpen: number
}

export interface GachaInventory {
  items: InventoryPieceMap
  unlocked: string[]
}

export interface GachaWallet {
  scraps: number
  gems: number
  bonusChests: BonusChestLedger
}

export interface GachaStreakState {
  currentStreak: number
  lastActiveDate: string | null
  nextChestAt: string | null
}

export interface GachaReward {
  cosmeticId: string
  pieces: number
}

export interface OpenChestRequest {
  chestId: string
  paymentMode?: GachaPaymentMode
}

export interface OpenChestResponse {
  rewards: GachaReward[]
  unlocked: string[]
  remainingScraps: number
  bonusChests: BonusChestLedger
  inventory: GachaInventory
}

export interface SyncGachaProfileResponse {
  wallet: GachaWallet
  inventory: GachaInventory
  streak: GachaStreakState
}
