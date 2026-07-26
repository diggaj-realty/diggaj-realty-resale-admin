'use client'

import { useRef, useState, useTransition } from 'react'
import { FileText, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { addDealDocument, reviewDealDocument } from '@/lib/actions/deals'

const REQUIRED_FROM_LABEL: Record<string, string> = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  EITHER: 'Buyer or Seller',
}

const STATUS_STYLE: Record<string, { color: string; icon: typeof Clock }> = {
  PENDING: { color: 'var(--text-3)', icon: Clock },
  UPLOADED: { color: 'var(--amber-700)', icon: Clock },
  APPROVED: { color: 'var(--green-700)', icon: CheckCircle2 },
  REJECTED: { color: 'var(--red-700)', icon: XCircle },
}

export interface DealDocumentView {
  id: string
  docType: string
  requiredFrom: string
  status: string
  fileUrl: string | null
  remarks: string | null
}

/** Deal-closure document checklist — separate from the free-text progress
 *  log. Staff/agent define what's required (e.g. "Sale deed", "NOC") and
 *  review what buyer/seller upload from their own (public-API-backed)
 *  frontend — this internal dashboard never collects the file itself. */
export default function DealDocuments({
  dealId,
  canManage,
  documents,
}: {
  dealId: string
  canManage: boolean
  documents: DealDocumentView[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function review(docId: string, status: 'APPROVED' | 'REJECTED') {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('dealId', dealId)
        fd.set('docId', docId)
        fd.set('status', status)
        await reviewDealDocument(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to review document')
      }
    })
  }

  return (
    <div className="card p-6" data-animate="fade-up">
      <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        <FileText size={15} /> Document Checklist
      </h3>

      {canManage && (
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            formData.set('dealId', dealId)
            startTransition(async () => {
              try {
                await addDealDocument(formData)
                formRef.current?.reset()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to add document')
              }
            })
          }}
          className="mb-5 flex flex-wrap items-end gap-2 border-b pb-5"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Document</label>
            <input
              name="docType"
              required
              placeholder="e.g. Sale deed"
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Required from</label>
            <select
              name="requiredFrom"
              defaultValue="EITHER"
              className="rounded-lg border px-2.5 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
            >
              <option value="BUYER">Buyer</option>
              <option value="SELLER">Seller</option>
              <option value="EITHER">Either</option>
            </select>
          </div>
          <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
            {pending ? 'Adding...' : 'Request document'}
          </button>
          {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
        </form>
      )}

      {documents.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>No documents required yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {documents.map((d) => {
            const style = STATUS_STYLE[d.status] ?? STATUS_STYLE.PENDING
            const Icon = style.icon
            return (
              <li key={d.id} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{d.docType}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      From: {REQUIRED_FROM_LABEL[d.requiredFrom] ?? d.requiredFrom}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: style.color }}>
                    <Icon size={13} /> {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                  </span>
                </div>
                {d.fileUrl && (
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs underline" style={{ color: 'var(--accent-700)' }}>
                    View uploaded file
                  </a>
                )}
                {d.remarks && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--red-700)' }}>{d.remarks}</p>
                )}
                {canManage && d.status === 'UPLOADED' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(d.id, 'APPROVED')}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(d.id, 'REJECTED')}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
