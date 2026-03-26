export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

export interface AttachmentItem {
  name: string
  fullPath: string
  relativePath: string
  kind: AttachmentKind
}

export type ImportedAttachmentSource = 'paste' | 'drop' | 'picker'

export function normalizePath(path: string) {
  return path.replace(/\\/g, '/')
}

export function getAttachmentUrl(fullPath: string) {
  const normalized = normalizePath(fullPath).replace(/^\/([A-Za-z]:)/, '$1')
  return encodeURI(`local-file:///${normalized}`)
}

export function detectAttachmentKind(name: string): AttachmentKind {
  const lower = name.toLowerCase()
  if (lower.endsWith('.webm') && /(recorded audio|pasted audio|audio|voice|mic|recording|sound)/.test(lower)) return 'audio'
  if (/\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)$/.test(lower)) return 'image'
  if (/\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/.test(lower)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|aac|flac|oga|webm)$/.test(lower)) return 'audio'
  return 'file'
}

export function detectAttachmentKindFromMime(type: string): AttachmentKind {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'file'
}

export function resolveAttachmentKind(name: string, kind?: AttachmentKind): AttachmentKind {
  if (kind && kind !== 'file') return kind
  return detectAttachmentKind(name)
}

function buildAttachmentTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ].join('')
}

function getExtensionFromMime(type: string) {
  const subtype = type.split('/')[1]?.toLowerCase()
  if (!subtype) return ''
  if (subtype === 'jpeg') return '.jpg'
  if (subtype === 'quicktime') return '.mov'
  if (subtype === 'mpeg') return '.mp3'
  if (subtype === 'x-wav') return '.wav'
  return `.${subtype}`
}

export function buildImportedAttachmentName(
  file: Pick<File, 'name' | 'type'>,
  source: ImportedAttachmentSource
) {
  const timestamp = buildAttachmentTimestamp()
  const mimeKind = detectAttachmentKindFromMime(file.type)
  const extFromName = file.name && file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const ext = extFromName || getExtensionFromMime(file.type) || ''

  if (source === 'picker') {
    return file.name || `Attachment ${timestamp}${ext}`
  }

  const label =
    mimeKind === 'image'
      ? 'Pasted image'
      : mimeKind === 'video'
        ? 'Pasted video'
        : mimeKind === 'audio'
          ? 'Pasted audio'
          : 'Pasted file'

  return `${label} ${timestamp}${ext}`
}

export function buildGeneratedAttachmentName(label: string, extension: string) {
  return `${label} ${buildAttachmentTimestamp()}${extension}`
}

export function openAttachmentPreview(attachment: AttachmentItem) {
  const overlay = document.createElement('div')
  overlay.className = 'attachment-preview-overlay'
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '5000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    background: 'rgba(0, 0, 0, 0.82)',
    backdropFilter: 'blur(8px)'
  })

  const panel = document.createElement('div')
  Object.assign(panel.style, {
    maxWidth: '92vw',
    maxHeight: '92vh',
    padding: '18px',
    borderRadius: '18px',
    border: '1px solid #2a2422',
    background: '#0a0808',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)'
  })

  const title = document.createElement('div')
  title.textContent = attachment.name
  Object.assign(title.style, {
    marginBottom: '14px',
    color: '#ffb77d',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.18em',
    textTransform: 'uppercase'
  })

  const closeOverlay = () => {
    overlay.remove()
    document.removeEventListener('keydown', handleKeyDown)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeOverlay()
  }

  let mediaNode: HTMLElement
  if (attachment.kind === 'image') {
    const image = document.createElement('img')
    image.src = getAttachmentUrl(attachment.fullPath)
    Object.assign(image.style, {
      display: 'block',
      maxWidth: 'calc(92vw - 80px)',
      maxHeight: 'calc(92vh - 120px)',
      borderRadius: '14px'
    })
    mediaNode = image
  } else if (attachment.kind === 'video') {
    const video = document.createElement('video')
    video.src = getAttachmentUrl(attachment.fullPath)
    video.controls = true
    video.autoplay = true
    video.preload = 'metadata'
    video.playsInline = true
    Object.assign(video.style, {
      display: 'block',
      maxWidth: 'calc(92vw - 80px)',
      maxHeight: 'calc(92vh - 120px)',
      borderRadius: '14px',
      background: '#000000'
    })
    mediaNode = video
  } else if (attachment.kind === 'audio') {
    const audio = document.createElement('audio')
    audio.src = getAttachmentUrl(attachment.fullPath)
    audio.controls = true
    audio.autoplay = true
    audio.preload = 'metadata'
    Object.assign(audio.style, {
      display: 'block',
      width: 'min(720px, 84vw)'
    })
    mediaNode = audio
  } else {
    const link = document.createElement('a')
    link.href = getAttachmentUrl(attachment.fullPath)
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = attachment.name
    Object.assign(link.style, {
      color: '#ffb77d',
      fontSize: '16px'
    })
    mediaNode = link
  }

  panel.append(title, mediaNode)
  overlay.appendChild(panel)
  overlay.addEventListener('click', closeOverlay)
  panel.addEventListener('click', (event) => event.stopPropagation())
  document.addEventListener('keydown', handleKeyDown)
  document.body.appendChild(overlay)
}

export function resolveAttachment(
  attachmentItems: AttachmentItem[],
  nameOrPath: string
) {
  const normalized = nameOrPath.trim().replace(/^attachments\//i, '').toLowerCase()
  return (
    attachmentItems.find((item) => item.name.toLowerCase() === normalized) ||
    attachmentItems.find((item) => item.relativePath.toLowerCase() === `attachments/${normalized}`) ||
    null
  )
}
