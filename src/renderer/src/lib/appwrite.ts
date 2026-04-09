import { Account, Client, Databases, Functions, Storage } from 'appwrite'
import { APPWRITE_CONFIG_KEYS, createEmptyRuntimeConfig } from '../../../shared/runtime-config'

const REQUIRED_APPWRITE_ENV_KEYS = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID',
  'VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID',
  'VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID',
  'VITE_APPWRITE_SNAPSHOTS_BUCKET_ID',
  'VITE_APPWRITE_AVATARS_BUCKET_ID'
] as const satisfies ReadonlyArray<keyof ImportMetaEnv>

const runtimeConfig =
  typeof window !== 'undefined' ? window.electronAPI?.runtimeConfig ?? createEmptyRuntimeConfig() : createEmptyRuntimeConfig()

const readEnv = (key: keyof ImportMetaEnv) => runtimeConfig[key] || import.meta.env[key]?.trim() || ''

const missingAppwriteEnvKeys = REQUIRED_APPWRITE_ENV_KEYS.filter((key) => !readEnv(key))
const appwriteConfigurationError =
  missingAppwriteEnvKeys.length > 0
    ? `Appwrite is disabled. Missing environment variables: ${missingAppwriteEnvKeys.join(', ')}`
    : null

const APPWRITE_ENDPOINT = readEnv('VITE_APPWRITE_ENDPOINT')
const APPWRITE_PROJECT_ID = readEnv('VITE_APPWRITE_PROJECT_ID')
const APPWRITE_DATABASE_ID = readEnv('VITE_APPWRITE_DATABASE_ID')
export const USER_SETTINGS_COLLECTION_ID = readEnv('VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID')
export const VAULT_SNAPSHOTS_COLLECTION_ID = readEnv('VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID')
export const SYNC_MANIFESTS_COLLECTION_ID = readEnv('VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID')
export const SNAPSHOTS_BUCKET_ID = readEnv('VITE_APPWRITE_SNAPSHOTS_BUCKET_ID')
export const AVATARS_BUCKET_ID = readEnv('VITE_APPWRITE_AVATARS_BUCKET_ID')
export const GACHA_USERS_COLLECTION_ID = readEnv('VITE_APPWRITE_GACHA_USERS_COLLECTION_ID')
export const GACHA_INVENTORY_COLLECTION_ID = readEnv('VITE_APPWRITE_GACHA_INVENTORY_COLLECTION_ID')
export const GACHA_COSMETICS_COLLECTION_ID = readEnv('VITE_APPWRITE_GACHA_COSMETICS_COLLECTION_ID')
export const GACHA_CHESTS_COLLECTION_ID = readEnv('VITE_APPWRITE_GACHA_CHESTS_COLLECTION_ID')
export const OPEN_CHEST_FUNCTION_ID = readEnv('VITE_APPWRITE_OPEN_CHEST_FUNCTION_ID')
export const SYNC_GACHA_PROFILE_FUNCTION_ID = readEnv('VITE_APPWRITE_SYNC_GACHA_PROFILE_FUNCTION_ID')

export const client = new Client()

if (!appwriteConfigurationError) {
  client.setEndpoint(APPWRITE_ENDPOINT)
  client.setProject(APPWRITE_PROJECT_ID)
} else {
  console.warn(appwriteConfigurationError)
}

export const getAppwriteProjectId = () => APPWRITE_PROJECT_ID

export const isAppwriteConfigured = () => appwriteConfigurationError === null

export const getAppwriteConfigurationError = () => appwriteConfigurationError

export const setAppwriteProjectId = (projectId: string) => {
  const normalizedProjectId = projectId.trim()
  if (normalizedProjectId && APPWRITE_PROJECT_ID && normalizedProjectId !== APPWRITE_PROJECT_ID) {
    throw new Error('This build is already connected to the Netherite Appwrite project.')
  }
}

export const account = new Account(client)
export const databases = new Databases(client)
export const functions = new Functions(client)
export const storage = new Storage(client)

export const DATABASE_ID = APPWRITE_DATABASE_ID
