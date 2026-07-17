'use client'

import { useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { formatINR } from '@/lib/format'
import { acceptCounter, rejectCounter } from '@/lib/actions/offers'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'

/** Buyer never sees PENDING_REVIEW as distinct text — `displayStatus` is pre-collapsed
 *  by the page (via buyerFacingOfferStatus) to "PENDING" before it reaches this row. */
export default function BuyerOfferRow({
  offerId,
  propertyTitle,
  location,
  amount,
  displayStatus,
  counterAmount,
}: {
  offerId: string
  propertyTitle: string
  location: string
  amount: number
  displayStatus: string
  counterAmount: number | null
}) {
  const [pending, startTransition] = useTransition()
  const actionable = displayStatus === 'COUNTERED'

  function withOfferId() {
    const fd = new FormData()
    fd.set('offerId', offerId)
    return fd
  }

  return (
    <div className="card flex items-center gap-4 px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{propertyTitle}</p>
        <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{location}</p>
      </div>
      <div className="text-right">
        <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(amount)}</span>
        {counterAmount != null && (
          <span className="block whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>Countered: {formatINR(counterAmount)}</span>
        )}
      </div>
      <OfferStatusPill status={displayStatus} />
      {actionable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => acceptCounter(withOfferId()))}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
          >
            <Check size={13} /> Accept Counter
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => rejectCounter(withOfferId()))}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
          >
            <X size={13} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}
