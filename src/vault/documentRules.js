// Frontend checks for "Upload related documents".
// Files are only checked and listed here; nothing is uploaded (see documentService.js).

export const DOCUMENT_RULES = {
  maxFiles: 5,
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB per file
  extensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'txt'],
  // Value for <input accept>, so the file picker suggests the right files.
  accept: '.pdf,.jpg,.jpeg,.png,.docx,.txt',
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const LEGACY_DOCS_PREFIX = 'https://storage.legacyvault.com/docs/'

export function resolveAttachmentUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith(LEGACY_DOCS_PREFIX)) {
    return `/api/v1/assets/documents/${trimmed.slice(LEGACY_DOCS_PREFIX.length)}`
  }
  return trimmed
}

export function stripEncryptedExtension(fileName) {
  const str = String(fileName || '').trim()
  return str.toLowerCase().endsWith('.enc') ? str.slice(0, -4) : str
}

export function extractDocumentName(url, fallbackName = 'attachment.pdf') {
  const cleanUrl = String(url || '').split('?')[0].split('#')[0]
  const lastPart = cleanUrl.split('/').pop() || ''
  let rawFileName = lastPart
  try {
    rawFileName = decodeURIComponent(lastPart)
  } catch {
    rawFileName = lastPart
  }
  if (!rawFileName) return fallbackName
  const uIdx = rawFileName.indexOf('_')
  const withoutUuid = (uIdx === 36 && rawFileName.length > 37)
    ? rawFileName.slice(37)
    : rawFileName
  return stripEncryptedExtension(withoutUuid) || fallbackName
}
function getExtension(fileName) {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

// Checks newly picked files against the rules and the files already in the list.
// Returns { accepted: [{ id, file, name, size, type }], rejected: [{ name, reason }] }
// where reason is 'type' | 'size' | 'empty' | 'duplicate' | 'count'.
export function checkNewFiles(newFiles, currentFiles) {
  const accepted = []
  const rejected = []
  const knownIds = new Set(currentFiles.map((item) => item.id))

  for (const file of newFiles) {
    const id = `${file.name}-${file.size}-${file.lastModified}`
    let reason
    if (!DOCUMENT_RULES.extensions.includes(getExtension(file.name))) reason = 'type'
    else if (file.size === 0) reason = 'empty'
    else if (file.size > DOCUMENT_RULES.maxSizeBytes) reason = 'size'
    else if (knownIds.has(id)) reason = 'duplicate'
    else if (currentFiles.length + accepted.length >= DOCUMENT_RULES.maxFiles) reason = 'count'

    if (reason) {
      rejected.push({ name: file.name, reason })
    } else {
      knownIds.add(id)
      accepted.push({ id, file, name: file.name, size: file.size, type: file.type })
    }
  }
  return { accepted, rejected }
}
