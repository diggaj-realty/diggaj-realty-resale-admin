'use client'

import { useState, useTransition } from 'react'
import { Check, Scale, X, XCircle } from 'lucide-react'
import { formatINR, formatRelativeTime } from '@/lib/format'
import { acceptCounter, rejectCounter, counterBack, closeNegotiation } from '@/lib/actions/offers'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'

/** Buyer never sees PENDING_REVIEW as distinct text — `displayStatus` is pre-collapsed
 *  by the page (via buyerFacingOfferStatus) to "PENDING" before it reaches this row.
 *
 *  No round limit on negotiation — whenever it's the buyer's turn (the
 *  offer has just been countered by the seller/backend), they can accept,
 *  reject, or counter back (handing the turn back to the seller). "Close
 *  negotiation" ends it without an agreement and works regardless of whose
 *  turn it currently is. */
export default function BuyerOfferRow({
  offerId,
  propertyTitle,
  location,
  amount,
  displayStatus,
  counterAmount,
  counterBy,
  message,
  createdAt,
}: {
  offerId: string
  propertyTitle: string
  location: string
  amount: number
  displayStatus: string
  counterAmount: number | null
  counterBy: string | null
  message: string | null
  createdAt: Date | string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counterOpen, setCounterOpen] = useState(false)
  const [amountInput, setAmountInput] = useState(String(counterAmount ?? amount))

  const myTurn = displayStatus === 'COUNTERED' && counterBy !== 'BUYER'
  const closable = displayStatus === 'PENDING' || displayStatus === 'COUNTERED'

  function withOfferId(extra?: Record<string, string>) {
    const fd = new FormData()
    fd.set('offerId', offerId)
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
    return fd
  }

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, failMessage: string) {
    setError(null)
    startTransition(async () => {
      try {
        await action(fd)
        setCounterOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : failMessage)
      }
    })
  }

  return (
    <div className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{propertyTitle}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{location}</p>
          {message && <p className="mt-1 truncate text-xs italic" style={{ color: 'var(--text-3)' }}>&ldquo;{message}&rdquo;</p>}
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(new Date(createdAt))}</p>
        </div>
        <div className="text-right">
          <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(amount)}</span>
          {counterAmount != null && (
            <span className="block whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>
              {counterBy === 'BUYER' ? 'Your counter: ' : 'Countered: '}{formatINR(counterAmount)}
            </span>
          )}
        </div>
        <OfferStatusPill status={displayStatus} />
        {myTurn && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(acceptCounter, withOfferId(), 'Failed to accept')}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              <Check size={13} /> Accept Counter
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setCounterOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}
            >
              <Scale size={13} /> Counter
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(rejectCounter, withOfferId(), 'Failed to reject')}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
            >
              <X size={13} /> Reject
            </button>
          </div>
        )}
        {closable && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(closeNegotiation, withOfferId(), 'Failed to close negotiation')}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            title="End this negotiation without an agreement"
          >
            <XCircle size={13} /> Close
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}

      {counterOpen && myTurn && (
        <form
          action={(formData) => run(counterBack, formData, 'Failed to send counter')}
          className="mt-3 flex items-center gap-2"
        >
          <input type="hidden" name="offerId" value={offerId} />
          <input
            type="number"
            name="counterAmount"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            min={1}
            className="w-40 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            disabled={pending}
            className="btn-accent rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
          >
            {pending ? 'Sending...' : 'Send Counter'}
          </button>
        </form>
      )}
    </div>
  )
}
