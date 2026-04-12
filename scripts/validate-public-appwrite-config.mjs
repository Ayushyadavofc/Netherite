import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const envFiles = ['.env', '.env.local']
const requiredKeys = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID',
  'VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID',
  'VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID',
  'VITE_APPWRITE_SNAPSHOTS_BUCKET_ID',
  'VITE_APPWRITE_AVATARS_BUCKET_ID',
  'VITE_APPWRITE_GACHA_USERS_COLLECTION_ID',
  'VITE_APPWRITE_GACHA_INVENTORY_COLLECTION_ID',
  'VITE_APPWRITE_GACHA_COSMETICS_COLLECTION_ID',
  'VITE_APPWRITE_GACHA_CHESTS_COLLECTION_ID',
  'VITE_APPWRITE_OPEN_CHEST_FUNCTION_ID',
  'VITE_APPWRITE_SYNC_GACHA_PROFILE_FUNCTION_ID'
]

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const result = {}
  const raw = fs.readFileSync(filePath, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }

  return result
}

const isPlaceholder = (value) => {
  if (!value) {
    return true
  }

  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith('your_') ||
    normalized.includes('<region>') ||
    normalized.includes('<') ||
    normalized.includes('placeholder')
  )
}

const merged = {}
for (const envFile of envFiles) {
  Object.assign(merged, parseEnvFile(path.join(repoRoot, envFile)))
}
for (const key of requiredKeys) {
  if (process.env[key]?.trim()) {
    merged[key] = process.env[key].trim()
  }
}

const missingKeys = requiredKeys.filter((key) => isPlaceholder(merged[key] ?? ''))

if (missingKeys.length > 0) {
  console.error('Missing public Appwrite runtime config for a production desktop build.')
  console.error('Fill these keys in .env or .env.local before running the Windows packaging scripts:')
  for (const key of missingKeys) {
    console.error(`- ${key}`)
  }
  console.error('Do not add APPWRITE_API_KEY or any admin secret to the desktop app env file.')
  process.exit(1)
}

console.log('Public Appwrite runtime config looks complete.')
