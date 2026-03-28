interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string
  readonly VITE_APPWRITE_PROJECT_ID: string
  readonly VITE_APPWRITE_DATABASE_ID: string
  readonly VITE_APPWRITE_USER_SETTINGS_COLLECTION_ID: string
  readonly VITE_APPWRITE_VAULT_SNAPSHOTS_COLLECTION_ID: string
  readonly VITE_APPWRITE_SYNC_MANIFESTS_COLLECTION_ID: string
  readonly VITE_APPWRITE_SNAPSHOTS_BUCKET_ID: string
  readonly VITE_APPWRITE_AVATARS_BUCKET_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
