import { type Models, Query } from 'appwrite'

import {
  DATABASE_ID,
  GACHA_CHESTS_COLLECTION_ID,
  GACHA_COSMETICS_COLLECTION_ID,
  OPEN_CHEST_FUNCTION_ID,
  SYNC_GACHA_PROFILE_FUNCTION_ID,
  databases,
  functions,
  getAppwriteConfigurationError,
  isAppwriteConfigured
} from '@/lib/appwrite'
import type {
  GachaChest,
  GachaCosmetic,
  OpenChestRequest,
  OpenChestResponse,
  SyncGachaProfileResponse
} from '../../../shared/gacha'

type ChestDocument = Models.Document & {
  id: string
  name: string
  cost: number
  rarityWeights: string
  piecesPerOpen: number
}

type CosmeticDocument = Models.Document & {
  id: string
  name: string
  rarity: 'common' | 'rare' | 'epic' | 'default'
  totalPieces?: number
  category?: 'cosmetic' | 'character'
  gender?: 'male' | 'female'
  animations?: string[]
}

const GACHA_REQUIRED_KEYS = {
  collections: [
    GACHA_CHESTS_COLLECTION_ID,
    GACHA_COSMETICS_COLLECTION_ID
  ],
  functions: [
    OPEN_CHEST_FUNCTION_ID,
    SYNC_GACHA_PROFILE_FUNCTION_ID
  ]
}

const parseFunctionResponse = <T>(execution: Models.Execution): T => {
  const body = execution.responseBody?.trim() ? JSON.parse(execution.responseBody) : {}
  if (execution.responseStatusCode >= 400) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Function failed with status ${execution.responseStatusCode}.`)
  }
  return body as T
}

const parseRecord = (value: string): Record<'common' | 'rare' | 'epic', number> => {
  const parsed = JSON.parse(value) as Record<string, unknown>
  return {
    common: typeof parsed.common === 'number' ? parsed.common : 0,
    rare: typeof parsed.rare === 'number' ? parsed.rare : 0,
    epic: typeof parsed.epic === 'number' ? parsed.epic : 0
  }
}

export const getGachaConfigurationError = () => {
  if (!isAppwriteConfigured()) {
    return getAppwriteConfigurationError() ?? 'Appwrite is not configured.'
  }

  const hasCollections = GACHA_REQUIRED_KEYS.collections.every((value) => Boolean(value))
  const hasFunctions = GACHA_REQUIRED_KEYS.functions.every((value) => Boolean(value))
  if (!hasCollections || !hasFunctions) {
    return 'Gacha is not configured yet. Add the gacha collection and function IDs to your Appwrite runtime config.'
  }

  return null
}

export const isGachaConfigured = () => getGachaConfigurationError() === null

export const listGachaChests = async (): Promise<GachaChest[]> => {
  const error = getGachaConfigurationError()
  if (error) {
    throw new Error(error)
  }

  const result = await databases.listDocuments<ChestDocument>({
    databaseId: DATABASE_ID,
    collectionId: GACHA_CHESTS_COLLECTION_ID,
    queries: [Query.limit(100)]
  })

  return result.documents
    .map((document) => ({
      id: document.id,
      name: document.name,
      cost: document.cost,
      rarityWeights: parseRecord(document.rarityWeights),
      piecesPerOpen: document.piecesPerOpen
    }))
    .sort((left, right) => left.cost - right.cost)
}

export const listGachaCosmetics = async (): Promise<GachaCosmetic[]> => {
  const error = getGachaConfigurationError()
  if (error) {
    throw new Error(error)
  }

  const result = await databases.listDocuments<CosmeticDocument>({
    databaseId: DATABASE_ID,
    collectionId: GACHA_COSMETICS_COLLECTION_ID,
    queries: [Query.limit(500)]
  })

  return result.documents
    .filter((document) => {
      if (document.category === 'character' || document.rarity === 'default') {
        return false
      }

      return typeof document.totalPieces === 'number'
    })
    .map((document) => ({
      id: document.id,
      name: document.name,
      rarity: document.rarity,
      totalPieces: document.totalPieces as number
    }))
}

const executeFunctionJson = async <T>(functionId: string, payload: Record<string, unknown>) => {
  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify(payload),
    async: false,
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    }
  })

  return parseFunctionResponse<T>(execution)
}

export const syncGachaProfile = async (): Promise<SyncGachaProfileResponse> => {
  const error = getGachaConfigurationError()
  if (error) {
    throw new Error(error)
  }

  return executeFunctionJson<SyncGachaProfileResponse>(SYNC_GACHA_PROFILE_FUNCTION_ID, {})
}

export const executeOpenChest = async (input: OpenChestRequest): Promise<OpenChestResponse> => {
  const error = getGachaConfigurationError()
  if (error) {
    throw new Error(error)
  }

  return executeFunctionJson<OpenChestResponse>(OPEN_CHEST_FUNCTION_ID, input)
}
