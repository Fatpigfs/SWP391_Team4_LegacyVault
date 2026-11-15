import { useState } from 'react'
import Button from '../../components/Button.jsx'
import FormAlert from '../../components/auth/FormAlert.jsx'
import Icon from '../../components/Icon.jsx'
import {
  ConfirmDialog,
  HandoverLayout,
  HandoverStatusBadge,
  HandoverTimeline,
} from '../../components/handover/HandoverParts.jsx'
import { EmptyState, ErrorState, LoadingState } from '../../components/vault/PageStates.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { handoverContent, handoverErrorText } from '../../data/handoverContent.js'
import { HANDOVER_STATUS, canStartHandover, hasReached } from '../../handover/handoverStatus.js'
import useAsync from '../../hooks/useAsync.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { IS_DEMO_MODE, listExecutorCases, resetDemoHandovers, startHandover } from '../../services/handoverService.js'
import { formatDisplayDateTime } from '../../vault/format.js'

// Flow 6 — Executor / Trustee: list of handover cases and the Start Handover action
// (steps 1–4: legal approval → start → identify beneficiary → notify).
export default function ExecutorHandoverPage() {
  const { user } = useAuth()
  const { language } = useLanguage()
  const t = handoverContent[language]
  const { status, data: cases, error, reload } = useAsync(() => listExecutorCases(user), user.id)

  const [confirming, setConfirming] = useState(null) // case waiting for confirmation
  const [busyId, setBusyId] = useState(null)
  const [feedback, setFeedback] = useState(null) // { tone, text, caseId }

  const doStart = async () => {
    const handover = confirming
    setBusyId(handover.id)
    setFeedback(null)
    try {
      const res = await startHandover(user, handover.id)
      const notifiedTo = res?.notification_sent_to || res?.notificationSentTo
      setFeedback({
        tone: 'success',
        text: notifiedTo
          ? (language === 'vi'
            ? `Đã phát hành bàn giao và gửi mã truy cập bảo mật qua email tới: ${notifiedTo}`
            : `Handover released and secure access code sent via email to: ${notifiedTo}`)
          : t.executor.started(handover.id),
        caseId: handover.id,
      })
      reload()
    } catch (err) {
      setFeedback({ tone: 'error', text: handoverErrorText(t, err), caseId: handover.id })
    } finally {
      setBusyId(null)
      setConfirming(null)
    }
  }

  const resetDemo = () => {
    resetDemoHandovers(user)
    setFeedback(null)
    reload()
  }

  const list = cases ?? []
  const stats = {
    total: list.length,
    waiting: list.filter((c) => c.status === HANDOVER_STATUS.PENDING_LEGAL_APPROVAL).length,
    active: list.filter((c) => hasReached(c.status, HANDOVER_STATUS.HANDOVER_INITIATED) && c.status !== HANDOVER_STATUS.COMPLETED).length,
    done: list.filter((c) => c.status === HANDOVER_STATUS.COMPLETED).length,
  }

  return (
    <HandoverLayout>
      <div className="page-head">
        <div>
          <span className="badge badge--accent">{t.executor.nav}</span>
          <h1 className="page-title">{t.executor.title}</h1>
          <p className="page-text">{t.executor.text}</p>
        </div>
        <div className="page-head__actions">
          {IS_DEMO_MODE && (
            <Button variant="secondary" size="sm" onClick={resetDemo}>
              {t.executor.reset}
            </Button>
          )}
        </div>
      </div>

      {status === 'loading' && <LoadingState label={t.loading} />}
      {status === 'error' && <ErrorState message={handoverErrorText(t, error)} retryLabel={t.retry} onRetry={reload} />}

      {status === 'ready' && (
        <>
          <dl className="stat-grid handover-stats">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="card stat-card">
                <dt>{t.executor.stats[key]}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {list.length === 0 ? (
            <EmptyState icon="inbox" title={t.executor.emptyTitle} text={t.executor.emptyText} />
          ) : (
            <div className="handover-list">
              {list.map((handover) => (
                <ExecutorCaseCard
                  key={handover.id}
                  handover={handover}
                  t={t}
                  language={language}
                  busy={busyId === handover.id}
                  feedback={feedback?.caseId === handover.id ? feedback : null}
                  onStart={() => setConfirming(handover)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={
            hasReached(confirming.status, HANDOVER_STATUS.HANDOVER_INITIATED)
              ? (language === 'vi' ? 'Gửi lại mã truy cập qua Email' : 'Resend Access Code via Email')
              : (language === 'vi' ? 'Xác nhận bàn giao' : 'Confirm Handover')
          }
          busy={Boolean(busyId)}
          onClose={() => setConfirming(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={Boolean(busyId)}>
                {t.executor.cancel}
              </Button>
              <Button onClick={doStart} disabled={Boolean(busyId)}>
                {busyId ? t.executor.starting : (language === 'vi' ? 'Đồng ý & Gửi mail' : 'Confirm & Send Mail')}
              </Button>
            </>
          }
        >
          <p className="page-text" style={{ marginBottom: '14px' }}>
            {hasReached(confirming.status, HANDOVER_STATUS.HANDOVER_INITIATED)
              ? (language === 'vi'
                ? 'Hệ thống sẽ cấp mã truy cập bảo mật mới và gửi lại qua email cho người thụ hưởng.'
                : 'A new secure access code will be generated and sent via email to the beneficiary.')
              : (language === 'vi'
                ? 'Sau khi xác nhận, hệ thống sẽ tạo mã truy cập bảo mật riêng và gửi email thông báo đến người thụ hưởng.'
                : 'After confirming, a unique secure access code will be generated and emailed to the beneficiary.')}
          </p>
          <div style={{
            background: 'var(--color-surface-hover, #f8fafc)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'grid',
            gap: '12px',
          }}>
            <div>
              <small style={{ display: 'block', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                {language === 'vi' ? 'Mã hồ sơ bàn giao' : 'Case Number'}
              </small>
              <code style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary, #2563eb)', wordBreak: 'break-all' }}>
                {confirming.id}
              </code>
            </div>
            <div>
              <small style={{ display: 'block', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                {language === 'vi' ? 'Người thụ hưởng' : 'Beneficiary'}
              </small>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(confirming.beneficiaries && confirming.beneficiaries.length > 0
                  ? confirming.beneficiaries
                  : [confirming.beneficiary]
                ).filter(Boolean).map((b, idx) => (
                  <div key={b.email || b.name || idx}>
                    <span style={{ fontWeight: 600 }}>{b.name}</span>
                    {b.email && (
                      <small style={{ display: 'block', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {b.email}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ConfirmDialog>
      )}
    </HandoverLayout>
  )
}

function ExecutorCaseCard({ handover, t, language, busy, feedback, onStart }) {
  const startable = canStartHandover(handover)
  const blockedText = t.executor?.blocked?.[handover.status]
  const started = hasReached(handover.status, HANDOVER_STATUS.HANDOVER_INITIATED)
  const assets = Array.isArray(handover.assets) ? handover.assets : []
  const timeline = Array.isArray(handover.timeline) ? handover.timeline : []

  return (
    <article className="card handover-card" aria-labelledby={`case-${handover.id}`}>
      <header className="handover-card__head">
        <div>
          <span className="handover-card__id">{t.caseId}</span>
          <h2 id={`case-${handover.id}`} className="section-title">{handover.id}</h2>
        </div>
        {handover.status === HANDOVER_STATUS.COMPLETED ? (
          <HandoverStatusBadge status={handover.status} />
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onStart}
            disabled={!startable || busy}
            title={
              !startable
                ? (language === 'vi'
                  ? 'Nút Bàn giao chỉ mở khi Xác minh pháp lý đã được duyệt (Approved)'
                  : 'Handover is only enabled once Legal Verification is Approved')
                : ''
            }
            style={{
              minWidth: '128px',
              gap: '6px',
              opacity: !startable ? 0.55 : 1,
              cursor: !startable ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon name="arrowRight" size={15} />
            {busy
              ? (t.executor?.starting || 'Starting...')
              : started
                ? (language === 'vi' ? 'Gửi lại mã qua Email' : 'Resend Code via Email')
                : (t.executor?.handoverBtn || (language === 'vi' ? 'Bàn giao' : 'Handover'))}
          </Button>
        )}
      </header>
      <dl className="handover-facts">
        <div>
          <dt>{t.beneficiaryLabel} {handover.beneficiaries?.length > 1 ? `(${handover.beneficiaries.length})` : ''}</dt>
          <dd style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {handover.beneficiaries && handover.beneficiaries.length > 0 ? (
              handover.beneficiaries.map((b, idx) => (
                <div key={b.email || b.name || idx}>
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  {b.email && <small style={{ color: 'var(--color-text-muted)', display: 'block' }}>{b.email}</small>}
                </div>
              ))
            ) : (
              <div>
                <div style={{ fontWeight: 600 }}>{handover.beneficiary?.name || '—'}</div>
                <small style={{ color: 'var(--color-text-muted)', display: 'block' }}>{handover.beneficiary?.email || ''}</small>
              </div>
            )}
          </dd>
        </div>
        <div>
          <dt>{t.vault}</dt>
          <dd>
            {handover.vault?.name || '—'}
            <small>{t.owner}: {handover.vault?.owner?.name || handover.vault?.ownerName || '—'}</small>
          </dd>
        </div>
        <div>
          <dt>{t.legalCase}</dt>
          <dd>
            {handover.legalCaseId || handover.case_id || handover.id || '—'}
            <small className={`handover-legal handover-legal--${handover.legalStatus || 'PENDING'}`}>
              {t.legal?.[handover.legalStatus] ?? handover.legalStatus ?? '—'}
            </small>
          </dd>
        </div>
      </dl>


      {assets.length > 0 && (
        <div>
          <h3 className="handover-subtitle">{t.assets} ({assets.length})</h3>
          <ul className="handover-asset-chips">
            {assets.map((asset, idx) => (
              <li key={asset.id || asset.asset_id || idx} className={asset.forThisBeneficiary ? '' : 'is-muted'}>
                <Icon name={asset.forThisBeneficiary ? 'unlock' : 'lock'} size={14} />
                {asset.name || asset.asset_name}
                <small>{t.categories?.[asset.category] ?? asset.category ?? '—'} · {asset.forThisBeneficiary ? t.executor.assetFor : t.executor.assetNotFor}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback && (
        <div style={{ display: 'grid', gap: '8px', margin: '8px 0' }}>
          <FormAlert tone={feedback.tone}>{feedback.text}</FormAlert>
        </div>
      )}

      <footer className="handover-card__actions">
        {handover.status === HANDOVER_STATUS.PENDING_LEGAL_APPROVAL && (
          <Button
            variant="primary" size="sm"
            to={`/dashboard/executor/submit-documents?caseId=${encodeURIComponent(handover.legalCaseId || handover.case_id || handover.id)}`}
          >
            <Icon name="upload" size={15} />
            {t.executor.uploadDoc}
          </Button>
        )}
        {!startable && blockedText && (
          <p className="handover-note"><Icon name="lock" size={14} /> {blockedText}</p>
        )}
        {!startable && started && handover.status !== HANDOVER_STATUS.COMPLETED && (
          <p className="handover-note"><Icon name="info" size={14} /> {t.executor.inProgress}</p>
        )}
        {handover.status === HANDOVER_STATUS.COMPLETED && (
          <p className="handover-note handover-note--success">
            <Icon name="check" size={14} /> {t.executor.completed(formatDisplayDateTime(handover.completedAt))}
          </p>
        )}
      </footer>

      {timeline.length > 0 && (
        <details className="handover-details">
          <summary>{t.executor?.timeline || 'Activity'}</summary>
          <HandoverTimeline events={timeline} />
        </details>
      )}
    </article>
  )
}
