import { Client, Databases, Permission, Role } from 'node-appwrite'

export const env = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? process.env.APPWRITE_FUNCTION_API_ENDPOINT ?? '',
  projectId: process.env.APPWRITE_PROJECT_ID ?? process.env.APPWRITE_FUNCTION_PROJECT_ID ?? '',
  apiKey: process.env.APPWRITE_API_KEY ?? process.env.APPWRITE_FUNCTION_API_KEY ?? '',
  databaseId: process.env.APPWRITE_DATABASE_ID ?? '',
  usersCollectionId: process.env.APPWRITE_GACHA_USERS_COLLECTION_ID ?? 'gacha_users',
  inventoryCollectionId: process.env.APPWRITE_GACHA_INVENTORY_COLLECTION_ID ?? 'gacha_inventory'
}

export const createDatabasesClient = () => {
  if (!env.endpoint || !env.projectId || !env.apiKey || !env.databaseId) {
    throw new Error('Missing required Appwrite environment variables for gacha profile sync.')
  }

  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.projectId)
    .setKey(env.apiKey)

  return new Databases(client)
}

export const createUserDocumentPermissions = (userId: string) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId))
]

export type GachaUserDocument = {
  $id: string
  userId: string
  scraps: number
  gems: number
  createdAt: string
  selectedCharacter?: string
  currentStreak?: number
  lastActiveDate?: string
  nextChestAt?: string
  bonusChests?: string
}

export type GachaInventoryDocument = {
  $id: string
  userId: string
  items: string
  unlocked: string[]
}
