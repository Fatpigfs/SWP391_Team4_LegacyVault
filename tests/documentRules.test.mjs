import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOCUMENT_RULES,
  checkNewFiles,
  extractDocumentName,
  normalizeDocumentNameForCompare,
  parseAttachmentDocuments,
  resolveAttachmentUrl,
} from '../src/vault/documentRules.js'

test('parseAttachmentDocuments splits comma-separated URLs and cleans UUID prefixes', () => {
  const url1 =
    'https://legacyvault-backend-ue8r.onrender.com/api/v1/assets/documents/11111111-1111-1111-1111-111111111111_Di_ch_c_cho_con__2_.docx'
  const url2 =
    'https://legacyvault-backend-ue8r.onrender.com/api/v1/assets/documents/c0868792-1041-488e-a545-a26396350a72_Screenshot_2026-11-17_130845.png'

  const docs = parseAttachmentDocuments(`${url1},${url2}`, {
    defaultSize: null,
    idPrefix: 'existing-doc',
  })

  assert.equal(docs.length, 2)
  assert.deepEqual(
    docs.map((d) => ({ id: d.id, name: d.name, size: d.size, url: d.url })),
    [
      {
        id: 'existing-doc-1',
        name: 'Di_ch_c_cho_con__2_.docx',
        size: null,
        url: url1,
      },
      {
        id: 'existing-doc-2',
        name: 'Screenshot_2026-11-17_130845.png',
        size: null,
        url: url2,
      },
    ],
  )
})

test('resolveAttachmentUrl maps legacy storage URLs to backend endpoint', () => {
  assert.equal(
    resolveAttachmentUrl('https://storage.legacyvault.com/docs/abc_sample.pdf'),
    '/api/v1/assets/documents/abc_sample.pdf',
  )
  assert.equal(
    extractDocumentName('https://example.com/files/11111111-1111-1111-1111-111111111111_report%20v1.pdf'),
    'report v1.pdf',
  )
})

test('checkNewFiles blocks duplicates against existing server files including sanitized names', () => {
  const existing = parseAttachmentDocuments(
    'https://api.example.com/api/v1/assets/documents/11111111-1111-1111-1111-111111111111_Di_ch_c_cho_con__2_.docx',
    { defaultSize: null, idPrefix: 'existing-doc' },
  )

  const picked = [
    { name: 'Di chúc cho con (2).docx', size: 2048, lastModified: 100 },
    { name: 'new_notes.txt', size: 512, lastModified: 200 },
  ]

  const { accepted, rejected } = checkNewFiles(picked, existing)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].name, 'new_notes.txt')
  assert.deepEqual(rejected, [{ name: 'Di chúc cho con (2).docx', reason: 'duplicate' }])
  assert.equal(
    normalizeDocumentNameForCompare('Di chúc cho con (2).docx'),
    normalizeDocumentNameForCompare('Di_ch_c_cho_con__2_.docx'),
  )
})

test('checkNewFiles enforces maxFiles across existing and newly picked files', () => {
  const existingUrls = Array.from({ length: DOCUMENT_RULES.maxFiles - 1 }, (_, i) =>
    `https://api.example.com/api/v1/assets/documents/11111111-1111-1111-1111-11111111111${i}_doc_${i + 1}.pdf`,
  ).join(',')
  const existing = parseAttachmentDocuments(existingUrls, { idPrefix: 'existing-doc' })

  const picked = [
    { name: 'extra_1.pdf', size: 1024, lastModified: 1 },
    { name: 'extra_2.pdf', size: 1024, lastModified: 2 },
  ]

  const { accepted, rejected } = checkNewFiles(picked, existing)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].name, 'extra_1.pdf')
  assert.deepEqual(rejected, [{ name: 'extra_2.pdf', reason: 'count' }])
})

test('extractDocumentName and parseAttachmentDocuments strip .enc suffix from encrypted stored filenames', () => {
  const encryptedUrl =
    'http://localhost:8080/api/v1/assets/documents/11111111-1111-1111-1111-111111111111_filea.pdf.enc'
  assert.equal(extractDocumentName(encryptedUrl), 'filea.pdf')

  const docs = parseAttachmentDocuments(encryptedUrl, { idPrefix: 'enc-doc' })
  assert.equal(docs.length, 1)
  assert.equal(docs[0].name, 'filea.pdf')
  assert.equal(
    normalizeDocumentNameForCompare('filea.pdf.enc'),
    normalizeDocumentNameForCompare('filea.pdf'),
  )
})
