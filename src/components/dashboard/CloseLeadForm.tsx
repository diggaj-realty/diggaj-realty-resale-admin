'use client'

import { useState, useTransition } from 'react'
import { XCircle } from 'lucide-react'
import { closeLead } from '@/lib/actions/interests'
import { LEAD_LOSS_REASONS, LEAD_LOSS_LABELS, lossEndsBuyerInterest } from '@/lib/visitOutcomes'

/** Ends a lead that is not going anywhere, with a reason.
 *
 *  Setting NOT_INTERESTED used to be the only way to do this, which left the lead
 *  looking open in the queue and recorded nothing about why it died. The reason is
 *  required because these codes are the only why-we-lose data the platform gets,
 *  and an optional field on a form nobody has time for stays empty. */
export default function CloseLeadForm({ interestId }: { interestId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
      >
        <XCircle size={13} /> Close this lead
      </button>
    )
  }

  return (
    <form
      action={(fd) => {
        setError(null)
        fd.set('interestId', interestId)
        start(async () => {
          try {
            await closeLead(fd)
            setOpen(false)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not close this lead')
          }
        })
      }}
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{ background: 'var(--surface-2)' }}
    >
      <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Why is this lead closing?
      </label>
      <select
        name="lossReason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
      >
        <option value="" disabled>Select a reason</option>
        {LEAD_LOSS_REASONS.map((r) => (
          <option key={r} value={r}>{LEAD_LOSS_LABELS[r]}</option>
        ))}
      </select>

      <input
        name="lossNote"
        placeholder="Anything worth recording (optional)"
        className="rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
      />

      {/* Says plainly whether this ends the buyer or only this property, since one
          of those closes their other leads too. */}
      {reason && (
        <p className="text-[11px]" style={{ color: lossEndsBuyerInterest(reason) ? 'var(--amber-700)' : 'var(--text-3)' }}>
          {lossEndsBuyerInterest(reason)
            ? "This buyer is out of the market, so their other open leads will be closed with it."
            : 'This is about this property only — the buyer stays open for other listings.'}
        </p>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !reason}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
        >
          {pending ? 'Closing...' : 'Close lead'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={pending}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
          style={{ color: 'var(--text-3)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
