import { Databases } from 'node-appwrite'

import { createDatabasesClient, createUserDocumentPermissions, env, type GachaInventoryDocument, type GachaUserDocument } from './config'

type BonusChestLedger = Record<string, number>
type AppwriteRuntimeContext = {
  req: any
  res: any
  log?: (message: string) => void
  error?: (message: string) => void
}

const STREAK_CHEST_MILESTONES: Record<number, 'bronze' | 'silver' | 'epic'> = {
  3: 'bronze',
  7: 'bronze',
  14: 'silver',
  30: 'epic'
}

const json = (response: any, statusCode: number, payload: unknown) => {
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

const parseSerializedMap = (value: unknown): BonusChestLedger => {
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const next: BonusChestLedger = {}
    for (const [key, raw] of Object.entries(parsed ?? {})) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        next[key] = raw
      }
    }
    return next
  } catch {
    return {}
  }
}

const serializeMap = (value: BonusChestLedger) => JSON.stringify(value)

const getHeader = (request: any, key: string) => {
  const headers = request?.headers ?? {}
  const matchedKey = Object.keys(headers).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
  if (!matchedKey) return null
  const value = headers[matchedKey]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

const getAuthenticatedUserId = (request: any) => {
  const userId = getHeader(request, 'x-appwrite-user-id')
  if (!userId || userId === 'guest') {
    throw new Error('You must be signed in to sync your gacha profile.')
  }

  return userId
}

const isNotFoundError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as Error & { code?: number }).code
  return code === 404 || error.message.toLowerCase().includes('not found')
}

const todayKey = (date = new Date()) => date.toISOString().slice(0, 10)
const yesterdayKey = (date = new Date()) => {
  const previous = new Date(date)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return todayKey(previous)
}

const nextEligibilityIso = (date = new Date()) => {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0))
  return next.toISOString()
}

const createDefaultUserDocument = (userId: string): Omit<GachaUserDocument, '$id'> => ({
  userId,
  scraps: 0,
  gems: 0,
  createdAt: new Date().toISOString(),
  currentStreak: 0,
  bonusChests: '{}'
})

const createDefaultInventoryDocument = (userId: string): Omit<GachaInventoryDocument, '$id'> => ({
  userId,
  items: '{}',
  unlocked: []
})

const ensureUserDocument = async (databases: Databases, userId: string): Promise<GachaUserDocument> => {
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

const ensureInventoryDocument = async (databases: Databases, userId: string): Promise<GachaInventoryDocument> => {
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

export default async ({ req, res, log, error }: AppwriteRuntimeContext) => {
  try {
    const databases = createDatabasesClient()
    const userId = getAuthenticatedUserId(req)
    const userDoc = await ensureUserDocument(databases, userId)
    const inventoryDoc = await ensureInventoryDocument(databases, userId)

    const now = new Date()
    const today = todayKey(now)
    const yesterday = yesterdayKey(now)
    const bonusChests = parseSerializedMap(userDoc.bonusChests ?? '{}')

    let currentStreak = userDoc.currentStreak ?? 0
    let lastActiveDate = userDoc.lastActiveDate
    let nextChestAt = userDoc.nextChestAt

    if (lastActiveDate !== today) {
      currentStreak = lastActiveDate === yesterday ? currentStreak + 1 : 1
      lastActiveDate = today
      nextChestAt = nextEligibilityIso(now)

      const milestoneChest = STREAK_CHEST_MILESTONES[currentStreak]
      if (milestoneChest) {
        bonusChests[milestoneChest] = (bonusChests[milestoneChest] ?? 0) + 1
      }

      await databases.updateDocument(env.databaseId, env.usersCollectionId, userId, {
        currentStreak,
        lastActiveDate,
        nextChestAt,
        bonusChests: serializeMap(bonusChests)
      })
    }

    log?.(`Synced gacha profile for ${userId} at streak ${currentStreak}.`)

    return json(res, 200, {
      wallet: {
        scraps: userDoc.scraps,
        gems: userDoc.gems,
        bonusChests
      },
      inventory: {
        items: parseSerializedMap(inventoryDoc.items),
        unlocked: inventoryDoc.unlocked ?? []
      },
      streak: {
        currentStreak,
        lastActiveDate,
        nextChestAt
      }
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to sync gacha profile.'
    error?.(message)
    return json(res, 500, { success: false, error: message })
  }
}
