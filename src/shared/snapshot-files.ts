const SNAPSHOT_NAME_SEPARATOR = '__'

const sanitizeSnapshotPart = (value: string, fallback: string) => {
  const normalized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .trim()

  return normalized || fallback
}

const pad = (value: number) => String(value).padStart(2, '0')

export const formatSnapshotTimestampForFile = (timestamp: string | number | Date = new Date()) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '19700101T000000Z'
  }

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

export const buildVaultSnapshotFileName = ({
  timestamp = new Date().toISOString(),
  vaultName,
  ownerId,
  vaultId
}: {
  timestamp?: string | number | Date
  vaultName: string
  ownerId: string
  vaultId: string
}) => {
  const safeVaultName = sanitizeSnapshotPart(vaultName, 'vault')
  const safeOwnerId = sanitizeSnapshotPart(ownerId, 'user')
  const safeVaultId = sanitizeSnapshotPart(vaultId, 'vault')
  const safeTimestamp = formatSnapshotTimestampForFile(timestamp)

  return `${safeTimestamp}${SNAPSHOT_NAME_SEPARATOR}${safeVaultName}${SNAPSHOT_NAME_SEPARATOR}${safeOwnerId}${SNAPSHOT_NAME_SEPARATOR}${safeVaultId}.zip`
}

export const parseVaultSnapshotFileName = (fileName: string) => {
  const normalizedName = fileName.trim()
  const match = normalizedName.match(
    /^(\d{8}T\d{6}Z)__(.+?)__(.+?)__(.+?)\.zip$/i
  )

  if (!match) {
    return null
  }

  const [, timestampToken, vaultName, ownerId, vaultId] = match
  const isoTimestamp = timestampToken.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    '$1-$2-$3T$4:$5:$6.000Z'
  )

  return {
    snapshotAt: isoTimestamp,
    vaultName,
    ownerId,
    vaultId
  }
}

export const isLegacyVaultSnapshotFileName = (fileName: string, vaultId: string) => {
  return fileName.trim() === `${vaultId}.zip`
}
