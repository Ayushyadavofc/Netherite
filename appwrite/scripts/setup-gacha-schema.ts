import { Client, Databases, Permission, Role } from 'node-appwrite'

const env = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? '',
  projectId: process.env.APPWRITE_PROJECT_ID ?? '',
  apiKey: process.env.APPWRITE_API_KEY ?? '',
  databaseId: process.env.APPWRITE_DATABASE_ID ?? '',
  usersCollectionId: process.env.APPWRITE_GACHA_USERS_COLLECTION_ID ?? 'gacha_users',
  inventoryCollectionId: process.env.APPWRITE_GACHA_INVENTORY_COLLECTION_ID ?? 'gacha_inventory',
  cosmeticsCollectionId: process.env.APPWRITE_GACHA_COSMETICS_COLLECTION_ID ?? 'gacha_cosmetics',
  chestsCollectionId: process.env.APPWRITE_GACHA_CHESTS_COLLECTION_ID ?? 'gacha_chests'
}

const LOOT_COSMETIC_TOTAL_PIECES = 6

const defaultCosmetics = [
  { id: 'shadow_gi', name: 'Shadow Gi', rarity: 'rare' },
  { id: 'ember_wraps', name: 'Ember Wraps', rarity: 'epic' },
  { id: 'dragon_scale', name: 'Dragon Scale', rarity: 'epic' },
  { id: 'cyber_eyes', name: 'Cyber Eyes', rarity: 'rare' },
  { id: 'circuit_halo', name: 'Circuit Halo', rarity: 'epic' },
  { id: 'street_hood', name: 'Street Hood', rarity: 'common' },
  { id: 'storm_runner', name: 'Storm Runner', rarity: 'rare' },
  { id: 'void_mask', name: 'Void Mask', rarity: 'epic' },
  { id: 'signal_jacket', name: 'Signal Jacket', rarity: 'common' }
] as const

const defaultCharacterCosmetics = [
  {
    id: 'swordsman',
    name: 'Swordsman',
    gender: 'male',
    animations: ['idle', 'walk', 'slash', 'backslash'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  },
  {
    id: 'dark-mage',
    name: 'Dark Mage',
    gender: 'male',
    animations: ['idle', 'walk', 'spell', 'thrust'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  },
  {
    id: 'archer-m',
    name: 'Archer',
    gender: 'male',
    animations: ['idle', 'walk', 'shoot'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  },
  {
    id: 'swordswoman',
    name: 'Swordswoman',
    gender: 'female',
    animations: ['idle', 'walk', 'slash', 'backslash'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  },
  {
    id: 'dark-mage-f',
    name: 'Dark Mage',
    gender: 'female',
    animations: ['idle', 'walk', 'spell', 'thrust'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  },
  {
    id: 'archer-f',
    name: 'Archer',
    gender: 'female',
    animations: ['idle', 'walk', 'shoot'],
    rarity: 'default',
    category: 'character',
    totalPieces: 1
  }
] as const

const defaultChests = [
  {
    id: 'bronze',
    name: 'Bronze Chest',
    cost: 100,
    rarityWeights: JSON.stringify({ common: 78, rare: 20, epic: 2 }),
    piecesPerOpen: 2
  },
  {
    id: 'silver',
    name: 'Silver Chest',
    cost: 300,
    rarityWeights: JSON.stringify({ common: 35, rare: 52, epic: 13 }),
    piecesPerOpen: 4
  },
  {
    id: 'epic',
    name: 'Epic Chest',
    cost: 800,
    rarityWeights: JSON.stringify({ common: 10, rare: 45, epic: 45 }),
    piecesPerOpen: 8
  }
] as const

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createDatabasesClient = () => {
  if (!env.endpoint || !env.projectId || !env.apiKey || !env.databaseId) {
    throw new Error('Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, or APPWRITE_DATABASE_ID.')
  }

  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.projectId)
    .setKey(env.apiKey)

  return new Databases(client)
}

const isAlreadyExistsError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as Error & { code?: number }).code
  return code === 409 || error.message.toLowerCase().includes('already exists')
}

const createCollectionIfMissing = async (
  databases: Databases,
  collectionId: string,
  name: string,
  permissions: string[],
  documentSecurity: boolean
) => {
  try {
    await databases.createCollection(env.databaseId, collectionId, name, permissions, documentSecurity, true)
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error
    }
  }
}

const createAttributeIfMissing = async (createAttribute: () => Promise<unknown>) => {
  try {
    await createAttribute()
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error
    }
  }
}

const createOrUpdateStringAttribute = async (
  createAttribute: () => Promise<unknown>,
  updateAttribute: () => Promise<unknown>
) => {
  try {
    await createAttribute()
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error
    }

    await updateAttribute()
  }
}

const createOrUpdateEnumAttribute = async (
  createAttribute: () => Promise<unknown>,
  updateAttribute: () => Promise<unknown>
) => {
  try {
    await createAttribute()
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error
    }

    await updateAttribute()
  }
}

const upsertDocument = async (
  databases: Databases,
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
  permissions?: string[]
) => {
  try {
    await databases.getDocument(env.databaseId, collectionId, documentId)
    await databases.updateDocument(env.databaseId, collectionId, documentId, data)
  } catch (error) {
    const code = (error as Error & { code?: number }).code
    if (code !== 404) {
      throw error
    }

    await databases.createDocument(env.databaseId, collectionId, documentId, data, permissions)
  }
}

async function main() {
  const databases = createDatabasesClient()

  await createCollectionIfMissing(databases, env.usersCollectionId, 'Gacha Users', [], true)
  await createCollectionIfMissing(databases, env.inventoryCollectionId, 'Gacha Inventory', [], true)
  await createCollectionIfMissing(databases, env.cosmeticsCollectionId, 'Gacha Cosmetics', [Permission.read(Role.any())], false)
  await createCollectionIfMissing(databases, env.chestsCollectionId, 'Gacha Chests', [Permission.read(Role.any())], false)

  await Promise.all([
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.usersCollectionId, 'userId', 64, true)),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.usersCollectionId, 'scraps', true)),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.usersCollectionId, 'gems', true)),
    createAttributeIfMissing(() => databases.createDatetimeAttribute(env.databaseId, env.usersCollectionId, 'createdAt', true)),
    createOrUpdateStringAttribute(
      () => databases.createStringAttribute(env.databaseId, env.usersCollectionId, 'selectedCharacter', 64, false, 'swordsman'),
      () => databases.updateStringAttribute(env.databaseId, env.usersCollectionId, 'selectedCharacter', false, 'swordsman', 64)
    ),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.usersCollectionId, 'currentStreak', false, 0)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.usersCollectionId, 'lastActiveDate', 32, false)),
    createAttributeIfMissing(() => databases.createDatetimeAttribute(env.databaseId, env.usersCollectionId, 'nextChestAt', false)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.usersCollectionId, 'bonusChests', 8192, false, '{}'))
  ])

  await Promise.all([
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.inventoryCollectionId, 'userId', 64, true)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.inventoryCollectionId, 'items', 65535, true)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.inventoryCollectionId, 'unlocked', 64, false, undefined, true))
  ])

  await Promise.all([
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.cosmeticsCollectionId, 'id', 64, true)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.cosmeticsCollectionId, 'name', 128, true)),
    createOrUpdateEnumAttribute(
      () =>
        databases.createEnumAttribute(
          env.databaseId,
          env.cosmeticsCollectionId,
          'rarity',
          ['common', 'rare', 'epic', 'default'],
          true,
          'common'
        ),
      () =>
        databases.updateEnumAttribute(
          env.databaseId,
          env.cosmeticsCollectionId,
          'rarity',
          ['common', 'rare', 'epic', 'default'],
          true,
          'common'
        )
    ),
    createOrUpdateEnumAttribute(
      () =>
        databases.createEnumAttribute(
          env.databaseId,
          env.cosmeticsCollectionId,
          'category',
          ['cosmetic', 'character'],
          false,
          'cosmetic'
        ),
      () =>
        databases.updateEnumAttribute(
          env.databaseId,
          env.cosmeticsCollectionId,
          'category',
          ['cosmetic', 'character'],
          false,
          'cosmetic'
        )
    ),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.cosmeticsCollectionId, 'gender', 16, false)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.cosmeticsCollectionId, 'animations', 64, false, undefined, true)),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.cosmeticsCollectionId, 'totalPieces', true))
  ])

  await Promise.all([
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.chestsCollectionId, 'id', 64, true)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.chestsCollectionId, 'name', 128, true)),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.chestsCollectionId, 'cost', true)),
    createAttributeIfMissing(() => databases.createStringAttribute(env.databaseId, env.chestsCollectionId, 'rarityWeights', 8192, true)),
    createAttributeIfMissing(() => databases.createIntegerAttribute(env.databaseId, env.chestsCollectionId, 'piecesPerOpen', true))
  ])

  await sleep(2_000)

  for (const cosmetic of defaultCosmetics) {
    await upsertDocument(databases, env.cosmeticsCollectionId, cosmetic.id, {
      id: cosmetic.id,
      name: cosmetic.name,
      rarity: cosmetic.rarity,
      category: 'cosmetic',
      totalPieces: LOOT_COSMETIC_TOTAL_PIECES
    }, [Permission.read(Role.any())])
  }

  for (const character of defaultCharacterCosmetics) {
    await upsertDocument(databases, env.cosmeticsCollectionId, character.id, {
      id: character.id,
      name: character.name,
      gender: character.gender,
      animations: [...character.animations],
      rarity: character.rarity,
      category: character.category,
      totalPieces: character.totalPieces
    }, [Permission.read(Role.any())])
  }

  for (const chest of defaultChests) {
    await upsertDocument(databases, env.chestsCollectionId, chest.id, {
      id: chest.id,
      name: chest.name,
      cost: chest.cost,
      rarityWeights: chest.rarityWeights,
      piecesPerOpen: chest.piecesPerOpen
    }, [Permission.read(Role.any())])
  }

  console.log('Gacha schema and seed data are ready.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
