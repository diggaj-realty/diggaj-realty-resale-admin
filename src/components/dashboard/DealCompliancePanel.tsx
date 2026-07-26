'use client'

import { useState, useTransition } from 'react'
import {
  ShieldCheck, FileSignature, Inbox, ListChecks, Check, X, Clock, AlertTriangle, Share2,
} from 'lucide-react'
import {
  reviewDocumentRequest,
  revokeDocumentAccess,
  reviewIdentityVerification,
  generateAgreement,
  recordSignature,
} from '@/lib/actions/dealCompliance'
import { formatINR, formatRelativeTime } from '@/lib/format'

export interface DocRequestView {
  id: string
  docType: string
  reason: string | null
  status: string
  reviewRemarks: string | null
  requestedByName: string
  /** Keyed by id rather than name so two parties sharing a display name can't
   *  collide when looking up what's shareable. */
  requestedFromId: string
  requestedFromName: string
  createdAt: string
}
export interface ShareableDocView {
  id: string
  docType: string
  ownerId: string | null
}
export interface AccessGrantView {
  id: string
  docType: string | null
  grantedToName: string | null
  status: string
  createdAt: string
}
export interface IdentityView {
  userId: string
  userName: string
  role: 'BUYER' | 'SELLER'
  status: string | null
  providerReference: string | null
  remarks: string | null
}
export interface SignatureView {
  userId: string
  userName: string
  role: string
  status: string
  providerReference: string | null
}
export interface AgreementView {
  id: string
  version: number
  status: string
  documentUrl: string | null
  agreedAmount: number | null
  signatures: SignatureView[]
}
export interface ClosureView {
  canClose: boolean
  blockers: string[]
  requirements: {
    finalPayment: { required: boolean; met: boolean }
    documents: { required: boolean; met: boolean; approved: number; total: number }
    identity: { required: boolean; met: boolean }
    agreement: { required: boolean; met: boolean }
    payments: { required: boolean; met: boolean; settled: number; total: number }
  }
}

/** Compliance side of a deal: cross-party document requests, identity checks,
 *  the agreement and its signatures, and what still blocks closure.
 *
 *  Several things are intentionally absent from this panel. Staff cannot confirm
 *  a negotiation for a party, cannot verify an identity without a provider
 *  reference, and cannot mark a signature complete without one either — those
 *  assertions have to come from outside the person making them, so the UI doesn't
 *  offer a shortcut it would then have to refuse. */
export default function DealCompliancePanel({
  dealId,
  canManage,
  isStaff,
  requests,
  shareableByOwner,
  grants,
  identities,
  agreement,
  closure,
}: {
  dealId: string
  canManage: boolean
  isStaff: boolean
  requests: DocRequestView[]
  shareableByOwner: Record<string, ShareableDocView[]>
  grants: AccessGrantView[]
  identities: IdentityView[]
  agreement: AgreementView | null
  closure: ClosureView
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<string | null>(null)

  function run(fn: (fd: FormData) => Promise<void>, fd: FormData, fail: string, after?: () => void) {
    setError(null)
    fd.set('dealId', dealId)
    startTransition(async () => {
      try {
        await fn(fd)
        after?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : fail)
      }
    })
  }

  const pendingRequests = requests.filter(
    (r) => r.status === 'PENDING_AGENT_REVIEW' || r.status === 'FORWARDED_TO_OWNER'
  )

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="card px-4 py-3 text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>
      )}

      {/* ── Closure checklist ── */}
      <section className="card p-6" data-animate="fade-up">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <ListChecks size={15} /> Closure checklist
          </h3>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={
              closure.canClose
                ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                : { background: 'var(--amber-50)', color: 'var(--amber-700)' }
            }
          >
            {closure.canClose ? 'Ready to close' : `${closure.blockers.length} blocker${closure.blockers.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          <Requirement label="Final payment recorded" {...closure.requirements.finalPayment} />
          <Requirement
            label={`Documents approved (${closure.requirements.documents.approved}/${closure.requirements.documents.total})`}
            {...closure.requirements.documents}
          />
          <Requirement label="Both identities verified" {...closure.requirements.identity} />
          <Requirement label="Agreement fully executed" {...closure.requirements.agreement} />
          <Requirement
            label={`Payments settled (${closure.requirements.payments.settled}/${closure.requirements.payments.total})`}
            {...closure.requirements.payments}
          />
        </ul>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
          Requirements marked &ldquo;not required&rdquo; are switched off in platform settings. A deal doesn&apos;t
          close just because payment arrived.
        </p>
      </section>

      {/* ── Cross-party document requests ── */}
      <section className="card p-6" data-animate="fade-up">
        <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <Inbox size={15} /> Document requests between parties
          {pendingRequests.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}
            >
              {pendingRequests.length} to review
            </span>
          )}
        </h3>

        {requests.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Neither party has requested a document from the other. When they do, it lands here for your review
            rather than going straight across.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {requests.map((r) => {
              const shareable = shareableByOwner[r.requestedFromId] ?? []
              const isOpen = openRequest === r.id
              const awaiting = r.status === 'PENDING_AGENT_REVIEW'
              return (
                <li key={r.id} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{r.docType}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {r.requestedByName} → {r.requestedFromName} · {formatRelativeTime(new Date(r.createdAt))}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
                      style={
                        awaiting
                          ? { background: 'var(--amber-50)', color: 'var(--amber-700)' }
                          : r.status === 'REJECTED'
                            ? { background: 'var(--red-50)', color: 'var(--red-700)' }
                            : { background: 'var(--green-50)', color: 'var(--green-700)' }
                      }
                    >
                      {r.status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  {r.reason && <p className="mt-1 text-xs italic" style={{ color: 'var(--text-2)' }}>&ldquo;{r.reason}&rdquo;</p>}
                  {r.reviewRemarks && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{r.reviewRemarks}</p>}

                  {canManage && awaiting && !isOpen && (
                    <button
                      type="button"
                      onClick={() => { setOpenRequest(r.id); setError(null) }}
                      className="btn-accent mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    >
                      Review
                    </button>
                  )}

                  {canManage && awaiting && isOpen && (
                    <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                      {shareable.length > 0 && (
                        <form action={(fd) => { fd.set('requestId', r.id); fd.set('action', 'shareExisting'); run(reviewDocumentRequest, fd, 'Failed to share', () => setOpenRequest(null)) }}
                          className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                              Share an approved document instead
                            </label>
                            <select
                              name="documentId"
                              className="rounded-lg border px-2 py-1.5 text-xs outline-none"
                              style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
                            >
                              {shareable.map((d) => (
                                <option key={d.id} value={d.id}>{d.docType}</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" disabled={pending}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                            style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
                            <Share2 size={11} /> Share existing
                          </button>
                        </form>
                      )}

                      <form action={(fd) => { fd.set('requestId', r.id); fd.set('action', 'forward'); run(reviewDocumentRequest, fd, 'Failed to forward', () => setOpenRequest(null)) }}>
                        <button type="submit" disabled={pending}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                          style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}>
                          Ask {r.requestedFromName} to upload it
                        </button>
                      </form>

                      <form action={(fd) => { fd.set('requestId', r.id); fd.set('action', 'reject'); run(reviewDocumentRequest, fd, 'Failed to decline', () => setOpenRequest(null)) }}
                        className="flex flex-wrap items-end gap-2">
                        <input name="remarks" required placeholder="Why are you declining this?"
                          className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', minWidth: 200 }} />
                        <button type="submit" disabled={pending}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
                          Decline
                        </button>
                      </form>

                      <button type="button" onClick={() => setOpenRequest(null)}
                        className="self-start rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                        style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {grants.length > 0 && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Shared access
            </p>
            <ul className="flex flex-col gap-1.5">
              {grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span style={{ color: 'var(--text-1)' }}>{g.docType}</span>
                  <span style={{ color: 'var(--text-3)' }}>→ {g.grantedToName}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={
                      g.status === 'ACTIVE'
                        ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                        : { background: 'var(--surface-2)', color: 'var(--text-3)' }
                    }
                  >
                    {g.status.toLowerCase()}
                  </span>
                  {canManage && g.status === 'ACTIVE' && (
                    <form action={(fd) => { fd.set('grantId', g.id); run(revokeDocumentAccess, fd, 'Failed to revoke') }}>
                      <button type="submit" disabled={pending} className="text-[10px] font-semibold underline disabled:opacity-60"
                        style={{ color: 'var(--red-700)' }}>
                        revoke
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Identity verification ── */}
      <section className="card p-6" data-animate="fade-up">
        <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <ShieldCheck size={15} /> Identity verification
        </h3>
        <ul className="flex flex-col gap-2.5">
          {identities.map((v) => (
            <li key={v.userId} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    {v.userName} <span className="font-normal" style={{ color: 'var(--text-3)' }}>· {v.role.toLowerCase()}</span>
                  </p>
                  {v.providerReference && (
                    <p className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{v.providerReference}</p>
                  )}
                  {v.remarks && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{v.remarks}</p>}
                </div>
                <StatusChip status={v.status ?? 'NOT_STARTED'} />
              </div>

              {isStaff && v.status !== 'VERIFIED' && (
                <form
                  action={(fd) => { fd.set('userId', v.userId); fd.set('status', 'VERIFIED'); run(reviewIdentityVerification, fd, 'Failed to record verification') }}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <input name="providerReference" required placeholder="Provider reference"
                    className="w-48 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
                  <button type="submit" disabled={pending}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                    style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
                    Mark verified
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
          Uploading an ID isn&apos;t verification. A provider reference is required, so a verified result traces back
          to evidence outside this system — and no party can verify themselves or the other side.
        </p>
      </section>

      {/* ── Agreement & signatures ── */}
      <section className="card p-6" data-animate="fade-up">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <FileSignature size={15} /> Agreement & signatures
          </h3>
          {agreement && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
              style={
                agreement.status === 'FULLY_EXECUTED'
                  ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                  : { background: 'var(--blue-50)', color: 'var(--blue-700)' }
              }>
              v{agreement.version} · {agreement.status.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
        </div>

        {!agreement ? (
          <>
            <p className="mb-3 text-sm" style={{ color: 'var(--text-3)' }}>
              No agreement generated yet. Every document must be approved and both identities verified first.
            </p>
            {canManage && (
              <form action={(fd) => run(generateAgreement, fd, 'Failed to generate agreement')}
                className="flex flex-wrap items-end gap-2">
                <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
                  <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                    Agreement document URL
                  </label>
                  <input name="documentUrl" placeholder="https://…"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
                </div>
                <button type="submit" disabled={pending}
                  className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
                  {pending ? 'Generating...' : 'Generate agreement'}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            {agreement.agreedAmount != null && (
              <p className="mb-3 text-sm" style={{ color: 'var(--text-2)' }}>
                For <span className="font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(agreement.agreedAmount)}</span>
                {agreement.documentUrl && (
                  <>
                    {' · '}
                    <a href={agreement.documentUrl} target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: 'var(--accent-700)' }}>
                      view document
                    </a>
                  </>
                )}
              </p>
            )}
            <ul className="flex flex-col gap-2.5">
              {agreement.signatures.map((s) => (
                <li key={s.userId} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                        {s.userName} <span className="font-normal" style={{ color: 'var(--text-3)' }}>· {s.role.toLowerCase()}</span>
                      </p>
                      {s.providerReference && (
                        <p className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{s.providerReference}</p>
                      )}
                    </div>
                    <StatusChip status={s.status} />
                  </div>

                  {isStaff && s.status !== 'SIGNED' && (
                    <form
                      action={(fd) => { fd.set('agreementId', agreement.id); fd.set('userId', s.userId); run(recordSignature, fd, 'Failed to record signature') }}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input name="provider" placeholder="Provider"
                        className="w-28 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
                      <input name="providerReference" required placeholder="Provider reference"
                        className="w-44 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
                      <button type="submit" disabled={pending}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                        style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
                        Record signature
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
              A signature is only recorded from a verified provider confirmation — an agent can chase signing but
              cannot declare it done, and one signature never makes an agreement fully executed.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

function Requirement({ label, required, met }: { label: string; required: boolean; met: boolean }) {
  const Icon = !required ? Clock : met ? Check : AlertTriangle
  const color = !required ? 'var(--text-3)' : met ? 'var(--green-700)' : 'var(--amber-700)'
  return (
    <li className="flex items-center gap-2 text-xs">
      <Icon size={13} style={{ color }} />
      <span style={{ color: 'var(--text-1)' }}>{label}</span>
      {!required && <span style={{ color: 'var(--text-3)' }}>· not required</span>}
    </li>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; icon: typeof Check }> = {
    VERIFIED: { bg: 'var(--green-50)', fg: 'var(--green-700)', icon: Check },
    SIGNED: { bg: 'var(--green-50)', fg: 'var(--green-700)', icon: Check },
    INITIATED: { bg: 'var(--blue-50)', fg: 'var(--blue-700)', icon: Clock },
    PENDING: { bg: 'var(--amber-50)', fg: 'var(--amber-700)', icon: Clock },
    NOT_STARTED: { bg: 'var(--surface)', fg: 'var(--text-3)', icon: Clock },
    FAILED: { bg: 'var(--red-50)', fg: 'var(--red-700)', icon: X },
    EXPIRED: { bg: 'var(--red-50)', fg: 'var(--red-700)', icon: X },
  }
  const s = map[status] ?? map.NOT_STARTED
  const Icon = s.icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
      style={{ background: s.bg, color: s.fg }}>
      <Icon size={11} /> {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  )
}
