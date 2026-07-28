'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Check, Scale, X, ChevronDown } from 'lucide-react'
import { formatINR, formatRelativeTime } from '@/lib/format'
import { backendCounterOffer, backendAcceptOffer, backendRejectOffer } from '@/lib/actions/backend'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'
import OfferTimeline, { type OfferTimelineEvent } from '@/components/dashboard/OfferTimeline'

/** A negotiation that's already past triage and still live.
 *
 *  Backend keeps acting on the seller's side here. That matters because the
 *  triage counter deliberately bypasses the seller — so once backend has
 *  countered, backend is the only party on that side of the table, and without
 *  these controls a buyer's counter-back would leave the negotiation stuck with
 *  nobody able to answer it.
 *
 *  Only rendered when it's genuinely backend's move; otherwise the row is
 *  read-only and says who's being waited on. */
export default function ActiveNegotiationRow({
  offerId,
  propertyId,
  propertyTitle,
  location,
  buyerName,
  amount,
  counterAmount,
  counterBy,
  status,
  currentAmount,
  ourTurn,
  updatedAt,
  events,
}: {
  offerId: string
  propertyId: string
  propertyTitle: string
  location: string
  buyerName: string
  amount: number
  counterAmount: number | null
  counterBy: string | null
  status: string
  currentAmount: number
  ourTurn: boolean
  updatedAt: Date | string
  events: OfferTimelineEvent[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counterOpen, setCounterOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [amountInput, setAmountInput] = useState(String(currentAmount))

  function run(fn: (fd: FormData) => Promise<void>, fd: FormData, fail: string, after?: () => void) {
    setError(null)
    fd.set('offerId', offerId)
    startTransition(async () => {
      try {
        await fn(fd)
        after?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : fail)
      }
    })
  }

  return (
    <div className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/listings/${propertyId}`}
            className="truncate text-sm font-semibold hover:underline"
            style={{ color: 'var(--text-1)' }}
          >
            {propertyTitle}
          </Link>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
            {location} · Buyer: {buyerName}
          </p>
        </div>

        <div className="text-right">
          <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
            {formatINR(currentAmount)}
          </span>
          <span className="block whitespace-nowrap text-[11px]" style={{ color: 'var(--text-3)' }}>
            {counterAmount != null
              ? `${counterBy === 'BUYER' ? 'buyer countered' : 'we countered'} · opened ${formatINR(amount)}`
              : 'buyer’s offer'}
          </span>
        </div>

        <OfferStatusPill status={status} />
        <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>
          {formatRelativeTime(new Date(updatedAt))}
        </span>

        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          <ChevronDown size={13} style={{ transform: historyOpen ? 'rotate(180deg)' : undefined }} /> History
        </button>

        {ourTurn ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(backendAcceptOffer, new FormData(), 'Failed to accept')}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              <Check size={13} /> Accept {formatINR(currentAmount)}
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
              onClick={() => run(backendRejectOffer, new FormData(), 'Failed to reject')}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
            >
              <X size={13} /> Reject
            </button>
          </div>
        ) : (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}
          >
            Waiting on the buyer
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}

      {counterOpen && ourTurn && (
        <form
          action={(fd) => run(backendCounterOffer, fd, 'Failed to send counter', () => setCounterOpen(false))}
          className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
          style={{ borderColor: 'var(--line)' }}
        >
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
            {pending ? 'Sending...' : 'Send counter'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            The buyer sees this as a counter from the seller.
          </span>
        </form>
      )}

      {historyOpen && (
        <div className="mt-3 pl-0.5">
          <OfferTimeline events={events} />
        </div>
      )}
    </div>
  )
}
