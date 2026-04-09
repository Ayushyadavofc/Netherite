import { randomInt } from 'crypto'
import { Databases, Query } from 'node-appwrite'
import { z } from 'zod'

import {
  createUserDocumentPermissions,
  env,
  type GachaChestDocument,
  type GachaCosmeticDocument,
  type GachaInventoryDocument,
  type GachaUserDocument
} from './config'

export const openChestSchema = z.object({
  chestId: z.string().min(1).max(64),
  paymentMode: z.enum(['scraps', 'bonus']).optional().default('scraps')
})

export type PieceMap = Record<string, number>
export type AppwriteRuntimeRequest = {
  body?: unknown
  bodyText?: string
  bodyJson?: unknown
  payload?: unknown
  headers?: Record<string, string | string[] | undefined>
}

const isJsonRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const json = (response: any, statusCode: number, payload: unknown) => {
  if (typeof response?.json === 'function') {
    return response.json(payload, statusCode)
  }

  if (typeof response?.send === 'function') {
    return response.send(JSON.stringify(payload), statusCode, {
      'content-type': 'application/json'
    })
  }

  return { statusCode, body: payload }
}

export const getHeader = (request: AppwriteRuntimeRequest, key: string) => {
  const headers = request.headers ?? {}
  const matchedKey = Object.keys(headers).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
  if (!matchedKey) return null
  const value = headers[matchedKey]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export const getAuthenticatedUserId = (request: AppwriteRuntimeRequest) => {
  const userId = getHeader(request, 'x-appwrite-user-id')
  if (!userId || userId === 'guest') {
    throw new Error('You must be signed in to open a chest.')
  }

  return userId
}

const parseJsonValue = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export const parseBody = <T>(request: AppwriteRuntimeRequest, schema: z.ZodType<T>) => {
  const raw =
    request.bodyJson ??
    (isJsonRecord(request.body) ? request.body : undefined) ??
    (isJsonRecord(request.payload) ? request.payload : undefined) ??
    parseJsonValue(typeof request.bodyText === 'string' ? request.bodyText : request.payload)

  return schema.parse(raw ?? {})
}

export const parseSerializedMap = <T extends number>(value: unknown): Record<string, T> => {
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const next: Record<string, T> = {}
    for (const [key, raw] of Object.entries(parsed ?? {})) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        next[key] = raw as T
      }
    }
    return next
  } catch {
    return {}
  }
}

export const serializeMap = (value: Record<string, number>) => JSON.stringify(value)

export const isNotFoundError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as Error & { code?: number }).code
  return code === 404 || error.message.toLowerCase().includes('not found')
}

export const createDefaultUserDocument = (userId: string): Omit<GachaUserDocument, '$id'> => ({
  userId,
  scraps: 0,
  gems: 0,
  createdAt: new Date().toISOString(),
  currentStreak: 0,
  bonusChests: '{}'
})

export const createDefaultInventoryDocument = (userId: string): Omit<GachaInventoryDocument, '$id'> => ({
  userId,
  items: '{}',
  unlocked: []
})

export const getRarityWeightWinner = (weights: Record<string, number>) => {
  const entries = Object.entries(weights).filter(([, weight]) => Number.isFinite(weight) && weight > 0)
  if (entries.length === 0) {
    throw new Error('Chest rarity weights are invalid.')
  }

  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let target = randomInt(totalWeight)

  for (const [key, weight] of entries) {
    if (target < weight) {
      return key
    }
    target -= weight
  }

  return entries[entries.length - 1][0]
}

const getDuplicateBoost = (pieces: number) => {
  if (pieces >= 5) return 6
  if (pieces >= 4) return 3
  return 1
}

export const pickRandomCosmetic = (
  rolledRarity: GachaCosmeticDocument['rarity'],
  cosmetics: GachaCosmeticDocument[],
  pieces: PieceMap,
  unlocked: Set<string>
) => {
  const unfinished = cosmetics.filter((cosmetic) => {
    if (unlocked.has(cosmetic.id)) {
      return false
    }

    return (pieces[cosmetic.id] ?? 0) < cosmetic.totalPieces
  })

  if (unfinished.length === 0) {
    return null
  }

  const preferredPool = unfinished.filter((cosmetic) => cosmetic.rarity === rolledRarity)
  const activePool = preferredPool.length > 0 ? preferredPool : unfinished
  const weightedPool = activePool.map((cosmetic) => ({
    cosmetic,
    weight: getDuplicateBoost(pieces[cosmetic.id] ?? 0)
  }))

  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0)
  let target = randomInt(totalWeight)

  for (const entry of weightedPool) {
    if (target < entry.weight) {
      return entry.cosmetic
    }
    target -= entry.weight
  }

  return weightedPool[weightedPool.length - 1]?.cosmetic ?? null
}

export const rollPieceReward = () => (randomInt(100) < 32 ? 2 : 1)

export const parseChestWeights = (chest: GachaChestDocument) => {
  try {
    const parsed = JSON.parse(chest.rarityWeights) as Record<string, number>
    return {
      common: Number(parsed.common ?? 0),
      rare: Number(parsed.rare ?? 0),
      epic: Number(parsed.epic ?? 0)
    }
  } catch {
    throw new Error(`Chest ${chest.id} has malformed rarity weights.`)
  }
}

export const buildRewardPayload = (rewardMap: Map<string, number>) =>
  [...rewardMap.entries()].map(([cosmeticId, pieces]) => ({ cosmeticId, pieces }))

export const getChestQueries = () => [Query.limit(100)]

export const ensureUserDocument = async (databases: Databases, userId: string): Promise<GachaUserDocument> => {
  try {
    return (await databases.getDocument(env.databaseId, env.usersCollectionId, userId)) as unknown as GachaUserDocument
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }

    return (await databases.createDocument(
      env.databaseId,
      env.usersCollectionId,
      userId,
      createDefaultUserDocument(userId),
      createUserDocumentPermissions(userId)
    )) as unknown as GachaUserDocument
  }
}

export const ensureInventoryDocument = async (databases: Databases, userId: string): Promise<GachaInventoryDocument> => {
  try {
    return (await databases.getDocument(env.databaseId, env.inventoryCollectionId, userId)) as unknown as GachaInventoryDocument
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }

    return (await databases.createDocument(
      env.databaseId,
      env.inventoryCollectionId,
      userId,
      createDefaultInventoryDocument(userId),
      createUserDocumentPermissions(userId)
    )) as unknown as GachaInventoryDocument
  }
}
