import { Account, Client, Databases, Storage } from 'appwrite'
import { APPWRITE_CONFIG_KEYS, createEmptyRuntimeConfig } from '../../../shared/runtime-config'

const REQUIRED_APPWRITE_ENV_KEYS = APPWRITE_CONFIG_KEYS as ReadonlyArray<keyof ImportMetaEnv>

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
export const storage = new Storage(client)

export const DATABASE_ID = APPWRITE_DATABASE_ID
