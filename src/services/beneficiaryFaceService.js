import { apiFetch } from './apiClient.js'

function enrollmentUrl(caseRef) {
  if (!caseRef) return '/handover/beneficiary/face/enrollment'
  return `/handover/beneficiary/face/enrollment?case_ref=${encodeURIComponent(caseRef)}`
}

export function getBeneficiaryFaceEnrollmentApi(caseRef) {
  return apiFetch(enrollmentUrl(caseRef))
}

export function enrollBeneficiaryFaceApi(payload, caseRef) {
  return apiFetch(enrollmentUrl(caseRef), {
    method: 'PUT',
    body: payload,
  })
}

export function createBeneficiaryFaceCheckApi(caseRef) {
  return apiFetch(`/handover/beneficiary/face/cases/${encodeURIComponent(caseRef)}/sessions`, {
    method: 'POST',
  })
}

export function completeBeneficiaryFaceCheckApi(caseRef, sessionId, payload) {
  return apiFetch(
    `/handover/beneficiary/face/cases/${encodeURIComponent(caseRef)}/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
      body: payload,
    },
  )
}
