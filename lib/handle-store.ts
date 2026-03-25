/**
 * IndexedDB helper for storing FileSystemDirectoryHandle objects.
 * Handles cannot be serialized to JSON/localStorage, so IndexedDB is required.
 */

const DB_NAME = "netherite-handles"
const STORE_NAME = "vault-handles"
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function storeHandle(
  vaultId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(handle, vaultId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getHandle(
  vaultId: string
): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(vaultId)
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function removeHandle(vaultId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(vaultId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
