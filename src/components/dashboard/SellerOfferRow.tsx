'use client'

import { useState, useTransition } from 'react'
import { Check, ChevronDown, Scale, X } from 'lucide-react'
import { formatINR, formatRelativeTime } from '@/lib/format'
import { acceptOffer, rejectOffer, counterOffer } from '@/lib/actions/offers'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'
import OfferTimeline, { type OfferTimelineEvent } from '@/components/dashboard/OfferTimeline'

export default function SellerOfferRow({
  offerId,
  propertyTitle,
  location,
  buyerName,
  buyerEmail,
  buyerPhone,
  message,
  amount,
  status,
  counterAmount,
  createdAt,
  events,
}: {
  offerId: string
  propertyTitle: string
  location: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  message: string | null
  amount: number
  status: string
  counterAmount: number | null
  createdAt: Date | string
  events: OfferTimelineEvent[]
}) {
  const [counterOpen, setCounterOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [amountInput, setAmountInput] = useState(String(amount))
  const [pending, startTransition] = useTransition()

  const actionable = status === 'PENDING'

  function withOfferId(extra?: Record<string, string>) {
    const fd = new FormData()
    fd.set('offerId', offerId)
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
    return fd
  }

  return (
    <div className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{propertyTitle}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{location}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
            Buyer: {buyerName} · {buyerEmail}{buyerPhone ? ` · ${buyerPhone}` : ''}
          </p>
          {message && <p className="mt-1 truncate text-xs italic" style={{ color: 'var(--text-3)' }}>&ldquo;{message}&rdquo;</p>}
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(new Date(createdAt))}</p>
        </div>
        <div className="text-right">
          <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(amount)}</span>
          {counterAmount != null && (
            <span className="block whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>Countered: {formatINR(counterAmount)}</span>
          )}
        </div>
        <OfferStatusPill status={status} />
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          <ChevronDown size={13} style={{ transform: historyOpen ? 'rotate(180deg)' : undefined }} /> History
        </button>
        {actionable && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => acceptOffer(withOfferId()))}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              <Check size={13} /> Accept
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
              onClick={() => startTransition(() => rejectOffer(withOfferId()))}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
            >
              <X size={13} /> Reject
            </button>
          </div>
        )}
      </div>

      {historyOpen && (
        <div className="mt-3 pl-0.5">
          <OfferTimeline events={events} />
        </div>
      )}

      {counterOpen && actionable && (
        <form
          action={(formData) => {
            startTransition(async () => {
              await counterOffer(formData)
              setCounterOpen(false)
            })
          }}
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
