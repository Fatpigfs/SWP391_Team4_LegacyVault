// Flow 2, step "Upload related documents".
//
// NOT UPLOADED: there is no file API yet, so nothing is sent anywhere.
// This only turns the picked files into metadata (name, size, type) that the asset keeps.
// The file contents are not read or stored.
//
// Backend hook-up: replace the body with a real upload that follows the backend's API
// contract (for example multipart upload or pre-signed URLs) and return the server's
// document ids instead of the local ones.

import { downloadBlob, getAuthToken, normalizeApiPath } from './apiClient.js'
import { extractDocumentName, resolveAttachmentUrl } from '../vault/documentRules.js'

export const UPLOAD_STATUS = {
  UPLOADED: 'UPLOADED',
  NOT_UPLOADED_DEMO: 'NOT_UPLOADED_DEMO',
}

export async function openOrDownloadAssetDocument(
  docUrl,
  { fileName, assetId, caseRef, download = false } = {},
) {
  const resolvedUrl = resolveAttachmentUrl(docUrl)
  if (!resolvedUrl) {
    throw new Error('Invalid document URL')
  }

  const token = getAuthToken()
  const baseEndpoint = normalizeApiPath(resolvedUrl)
  const params = new URLSearchParams()
  if (assetId) params.set('asset_id', assetId)
  if (caseRef) params.set('case_ref', caseRef)
  if (download) params.set('download', 'true')
  const query = params.toString()
  const separator = baseEndpoint.includes('?') ? '&' : '?'
  const endpoint = query ? `${baseEndpoint}${separator}${query}` : baseEndpoint

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const error = new Error(
      data?.error ||
        data?.message ||
        (response.status === 403
          ? 'Bạn không có quyền giải mã hoặc truy cập tài liệu này.'
          : 'Không thể tải hoặc giải mã tài liệu đính kèm.'),
    )
    error.status = response.status
    error.data = data
    throw error
  }

  const blob = await response.blob()
  const cleanName = extractDocumentName(fileName || resolvedUrl, 'document.pdf')
  const lowerName = cleanName.toLowerCase()

  if (download || lowerName.endsWith('.docx')) {
    downloadBlob(blob, cleanName)
    return
  }

  if (typeof window !== 'undefined') {
    const objectUrl = window.URL.createObjectURL(blob)
    const openedWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer')
    if (!openedWindow) {
      downloadBlob(blob, cleanName)
    }
    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl)
    }, 60000)
  }
}

export async function uploadAssetDocumentApi(file) {
  const token = localStorage.getItem('token') || localStorage.getItem('legacyvault-access-token')
  if (!token) {
    const error = new Error('No authentication token found')
    error.status = 401
    throw error
  }

  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.REACT_APP_API_BASE_URL ||
    ''
  ).replace(/\/$/, '')

  const endpoint = baseUrl
    ? (baseUrl.endsWith('/api/v1')
        ? `${baseUrl}/assets/documents/upload`
        : `${baseUrl}/api/v1/assets/documents/upload`)
    : '/api/v1/assets/documents/upload'

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || 'Failed to upload document')
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

// Input:  [{ id, file, name, size, type }] from documentRules.checkNewFiles
// Output: [{ id, name, size, type, url, uploadStatus }]
export async function prepareDocuments(pickedFiles = []) {
  const token = localStorage.getItem('token') || localStorage.getItem('legacyvault-access-token')
  const results = []

  for (const item of pickedFiles) {
    if (token && item.file instanceof File) {
      try {
        const uploaded = await uploadAssetDocumentApi(item.file)
        results.push({
          id: `doc-${item.id}`,
          name: uploaded.fileName || item.name,
          size: uploaded.fileSize || item.size,
          type: uploaded.contentType || item.type,
          url: uploaded.url,
          uploadStatus: UPLOAD_STATUS.UPLOADED,
        })
        continue
      } catch (err) {
        console.warn('Upload asset document fallback:', err)
      }
    }
    results.push({
      id: `doc-${item.id}`,
      name: item.name,
      size: item.size,
      type: item.type,
      url: item.url || '',
      uploadStatus: UPLOAD_STATUS.NOT_UPLOADED_DEMO,
    })
  }

  return results
}
