export const APPWRITE_CONFIG_KEYS = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID',
  'VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID',
  'VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID',
  'VITE_APPWRITE_SNAPSHOTS_BUCKET_ID',
  'VITE_APPWRITE_AVATARS_BUCKET_ID'
] as const

export type AppwriteConfigKey = (typeof APPWRITE_CONFIG_KEYS)[number]

export type RuntimeAppConfig = Record<AppwriteConfigKey, string>

export const RUNTIME_CONFIG_FILE_NAME = 'runtime-config.json'

export const createEmptyRuntimeConfig = (): RuntimeAppConfig => ({
  VITE_APPWRITE_ENDPOINT: '',
  VITE_APPWRITE_PROJECT_ID: '',
  VITE_APPWRITE_DATABASE_ID: '',
  VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID: '',
  VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID: '',
  VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID: '',
  VITE_APPWRITE_SNAPSHOTS_BUCKET_ID: '',
  VITE_APPWRITE_AVATARS_BUCKET_ID: ''
})

export const normalizeRuntimeConfig = (value: unknown): RuntimeAppConfig => {
  const normalized = createEmptyRuntimeConfig()

  if (!value || typeof value !== 'object') {
    return normalized
  }

  for (const key of APPWRITE_CONFIG_KEYS) {
    const nextValue = (value as Record<string, unknown>)[key]
    normalized[key] = typeof nextValue === 'string' ? nextValue.trim() : ''
  }

  return normalized
}
