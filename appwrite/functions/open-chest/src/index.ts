import { Query } from 'node-appwrite'

import { createDatabasesClient, env, type GachaChestDocument, type GachaCosmeticDocument } from './config'
import {
  buildRewardPayload,
  ensureInventoryDocument,
  ensureUserDocument,
  getAuthenticatedUserId,
  getRarityWeightWinner,
  json,
  openChestSchema,
  parseBody,
  parseChestWeights,
  parseSerializedMap,
  pickRandomCosmetic,
  rollPieceReward,
  serializeMap
} from './gacha-utils'

type AppwriteRuntimeContext = {
  req: any
  res: any
  log?: (message: string) => void
  error?: (message: string) => void
}

export default async ({ req, res, log, error }: AppwriteRuntimeContext) => {
  const databases = createDatabasesClient()

  try {
    const userId = getAuthenticatedUserId(req)
    const input = parseBody(req, openChestSchema)

    const userDoc = await ensureUserDocument(databases, userId)
    const inventoryDoc = await ensureInventoryDocument(databases, userId)
    const chestDoc = (await databases.getDocument(
      env.databaseId,
      env.chestsCollectionId,
      input.chestId
    )) as unknown as GachaChestDocument
    const cosmeticsResult = (await databases.listDocuments(
      env.databaseId,
      env.cosmeticsCollectionId,
      [Query.limit(500)]
    )) as unknown as { documents: GachaCosmeticDocument[] }

    if ((cosmeticsResult.documents ?? []).length === 0) {
      return json(res, 409, { error: 'No cosmetics are configured in the gacha catalog.' })
    }

    const piecesByCosmetic = parseSerializedMap<number>(inventoryDoc.items)
    const bonusChests = parseSerializedMap<number>(userDoc.bonusChests ?? '{}')
    const unlockedSet = new Set(inventoryDoc.unlocked ?? [])
    const newlyUnlocked: string[] = []
    const rewardMap = new Map<string, number>()

    if (input.paymentMode === 'bonus') {
      const remainingBonus = bonusChests[chestDoc.id] ?? 0
      if (remainingBonus <= 0) {
        return json(res, 400, { error: `No bonus ${chestDoc.name} chests are available.` })
      }

      bonusChests[chestDoc.id] = remainingBonus - 1
      if (bonusChests[chestDoc.id] <= 0) {
        delete bonusChests[chestDoc.id]
      }
    } else if (userDoc.scraps < chestDoc.cost) {
      return json(res, 400, { error: 'Not enough scraps for this chest.' })
    }

    const chestWeights = parseChestWeights(chestDoc)

    for (let rollIndex = 0; rollIndex < chestDoc.piecesPerOpen; rollIndex += 1) {
      const rolledRarity = getRarityWeightWinner(chestWeights) as GachaCosmeticDocument['rarity']
      const cosmetic = pickRandomCosmetic(rolledRarity, cosmeticsResult.documents, piecesByCosmetic, unlockedSet)

      if (!cosmetic) {
        break
      }

      const currentPieces = piecesByCosmetic[cosmetic.id] ?? 0
      const nextPieces = Math.min(cosmetic.totalPieces, currentPieces + rollPieceReward())
      const actualPieces = nextPieces - currentPieces

      if (actualPieces <= 0) {
        unlockedSet.add(cosmetic.id)
        continue
      }

      piecesByCosmetic[cosmetic.id] = nextPieces
      rewardMap.set(cosmetic.id, (rewardMap.get(cosmetic.id) ?? 0) + actualPieces)

      if (nextPieces >= cosmetic.totalPieces && !unlockedSet.has(cosmetic.id)) {
        unlockedSet.add(cosmetic.id)
        newlyUnlocked.push(cosmetic.id)
      }
    }

    const rewards = buildRewardPayload(rewardMap)
    if (rewards.length === 0) {
      return json(res, 409, { error: 'All available cosmetics are already completed.' })
    }

    const nextScraps = input.paymentMode === 'bonus' ? userDoc.scraps : userDoc.scraps - chestDoc.cost

    await databases.updateDocument(env.databaseId, env.usersCollectionId, userId, {
      scraps: nextScraps,
      bonusChests: serializeMap(bonusChests)
    })
    await databases.updateDocument(env.databaseId, env.inventoryCollectionId, userId, {
      items: serializeMap(piecesByCosmetic),
      unlocked: [...unlockedSet]
    })

    log?.(`Opened ${chestDoc.id} for ${userId}.`)

    return json(res, 200, {
      rewards,
      unlocked: newlyUnlocked,
      remainingScraps: nextScraps,
      bonusChests,
      inventory: {
        items: piecesByCosmetic,
        unlocked: [...unlockedSet]
      }
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to open chest.'
    error?.(message)
    return json(res, 400, { error: message })
  }
}
