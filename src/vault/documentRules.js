// Frontend checks for "Upload related documents".
// Files are only checked and listed here; nothing is uploaded (see documentService.js).

export const DOCUMENT_RULES = {
  maxFiles: 5,
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB per file
  extensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'txt'],
  // Value for <input accept>, so the file picker suggests the right files.
  accept: '.pdf,.jpg,.jpeg,.png,.docx,.txt',
}

const LEGACY_DOCS_PREFIX = 'https://storage.legacyvault.com/docs/'

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function resolveAttachmentUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith(LEGACY_DOCS_PREFIX)) {
    return `/api/v1/assets/documents/${trimmed.slice(LEGACY_DOCS_PREFIX.length)}`
  }
  return trimmed
}

export function extractDocumentName(url, fallbackName = 'attachment.pdf') {
  const lastPart = String(url || '').split('/').pop() || ''
  let rawFileName = lastPart
  try {
    rawFileName = decodeURIComponent(lastPart)
  } catch {
    rawFileName = lastPart
  }
  if (!rawFileName) return fallbackName
  const uIdx = rawFileName.indexOf('_')
  if (uIdx === 36 && rawFileName.length > 37) {
    return rawFileName.slice(37)
  }
  return rawFileName
}

// Mirrors backend FileStorageSupport.buildStoredFilename sanitization so duplicate checks
// match existing server documents even when spaces or Vietnamese characters became '_'.
export function normalizeDocumentNameForCompare(name) {
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase()
}

export function parseAttachmentDocuments(attachmentUrl, options = {}) {
  const {
    defaultSize = null,
    fallbackName = 'attachment.pdf',
    idPrefix = 'doc',
    useResolvedUrl = false,
  } = options

  if (!attachmentUrl || typeof attachmentUrl !== 'string') {
    return []
  }

  return attachmentUrl
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((rawUrl, index) => {
      const resolvedUrl = resolveAttachmentUrl(rawUrl)
      const fallback = typeof fallbackName === 'function' ? fallbackName(index) : fallbackName
      return {
        id: `${idPrefix}-${index + 1}`,
        name: extractDocumentName(resolvedUrl, fallback),
        size: defaultSize,
        url: useResolvedUrl ? resolvedUrl : rawUrl,
        resolvedUrl,
      }
    })
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
  const knownNames = new Set(
    currentFiles.map((item) => normalizeDocumentNameForCompare(item.name)).filter(Boolean),
  )

  for (const file of newFiles) {
    const id = `${file.name}-${file.size}-${file.lastModified}`
    const normalizedName = normalizeDocumentNameForCompare(file.name)
    let reason
    if (!DOCUMENT_RULES.extensions.includes(getExtension(file.name))) reason = 'type'
    else if (file.size === 0) reason = 'empty'
    else if (file.size > DOCUMENT_RULES.maxSizeBytes) reason = 'size'
    else if (knownIds.has(id) || (normalizedName && knownNames.has(normalizedName))) reason = 'duplicate'
    else if (currentFiles.length + accepted.length >= DOCUMENT_RULES.maxFiles) reason = 'count'

    if (reason) {
      rejected.push({ name: file.name, reason })
    } else {
      knownIds.add(id)
      if (normalizedName) knownNames.add(normalizedName)
      accepted.push({ id, file, name: file.name, size: file.size, type: file.type })
    }
  }
  return { accepted, rejected }
}
