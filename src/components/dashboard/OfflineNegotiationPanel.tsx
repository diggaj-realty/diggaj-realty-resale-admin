'use client'

import { useRef, useState, useTransition } from 'react'
import { Handshake, CheckCircle2 } from 'lucide-react'
import { recordOfflineNegotiation } from '@/lib/actions/dealOps'
import { formatINR, formatRelativeTime } from '@/lib/format'

export interface OfflineNegotiationView {
  id: string
  agreedAmount: number
  buyerConfirmed: boolean
  sellerConfirmed: boolean
  notes: string | null
  recordedByName: string
  createdAt: string
}

/** Negotiation that happened in person / by phone rather than on the platform.
 *  Recorded after the fact by the assigned agent (or staff). Deliberately does
 *  not touch the platform offer history — both records coexist. */
export default function OfflineNegotiationPanel({
  dealId,
  canRecord,
  records,
}: {
  dealId: string
  canRecord: boolean
  records: OfflineNegotiationView[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const latest = records[0]

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <Handshake size={15} /> Offline Negotiation
        </h3>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={
            latest
              ? { background: 'var(--green-50)', color: 'var(--green-700)' }
              : { background: 'var(--surface-2)', color: 'var(--text-3)' }
          }
        >
          {latest ? 'Recorded' : 'Not recorded'}
        </span>
      </div>

      {latest && (
        <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--surface-2)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(latest.agreedAmount)}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Recorded by {latest.recordedByName} · {formatRelativeTime(new Date(latest.createdAt))}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ConfirmChip label="Buyer confirmed" on={latest.buyerConfirmed} />
            <ConfirmChip label="Seller confirmed" on={latest.sellerConfirmed} />
          </div>
          {latest.notes && <p className="mt-2 text-sm" style={{ color: 'var(--text-1)' }}>{latest.notes}</p>}
        </div>
      )}

      {records.length > 1 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>
            {records.length - 1} earlier record{records.length - 1 === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {records.slice(1).map((r) => (
              <li key={r.id} className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                <span className="font-semibold">{formatINR(r.agreedAmount)}</span> · {r.recordedByName} ·{' '}
                {formatRelativeTime(new Date(r.createdAt))}
                {r.notes && <p className="mt-1">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canRecord && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold"
        >
          {latest ? 'Record another negotiation' : 'Record offline negotiation'}
        </button>
      )}

      {canRecord && open && (
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            formData.set('dealId', dealId)
            startTransition(async () => {
              try {
                await recordOfflineNegotiation(formData)
                formRef.current?.reset()
                setOpen(false)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to record negotiation')
              }
            })
          }}
          className="flex flex-col gap-3 border-t pt-4"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Agreed amount (₹)</label>
            <input
              type="number"
              name="agreedAmount"
              required
              min={1}
              placeholder="5400000"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" name="buyerConfirmed" /> Buyer confirmed
            </label>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" name="sellerConfirmed" /> Seller confirmed
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="e.g. Buyer and seller agreed on this amount after the site visit."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
              {pending ? 'Saving...' : 'Save record'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null) }}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Cancel
            </button>
            {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
          </div>
        </form>
      )}

      {!canRecord && !latest && (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>No offline negotiation has been recorded for this deal.</p>
      )}
    </div>
  )
}

function ConfirmChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={
        on
          ? { background: 'var(--green-50)', color: 'var(--green-700)' }
          : { background: 'var(--surface)', color: 'var(--text-3)' }
      }
    >
      {on && <CheckCircle2 size={11} />} {label}{on ? '' : ': no'}
    </span>
  )
}
