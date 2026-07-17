'use client'

import { useState, useTransition } from 'react'
import { ArrowRightCircle, Scale, X } from 'lucide-react'
import { formatINR } from '@/lib/format'
import { forwardOffer, counterOfferAsBackend, rejectOfferAsBackend } from '@/lib/actions/backend'

export default function NegotiationRow({
  offerId,
  propertyTitle,
  location,
  buyerName,
  amount,
  message,
}: {
  offerId: string
  propertyTitle: string
  location: string
  buyerName: string
  amount: number
  message: string | null
}) {
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterAmount, setCounterAmount] = useState(String(amount))
  const [done, setDone] = useState<'FORWARDED' | 'COUNTERED' | 'REJECTED' | null>(null)
  const [pending, startTransition] = useTransition()

  function withOfferId(extra?: Record<string, string>) {
    const fd = new FormData()
    fd.set('offerId', offerId)
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
    return fd
  }

  if (done) {
    const label = done === 'FORWARDED' ? 'Forwarded to seller' : done === 'COUNTERED' ? 'Countered' : 'Rejected'
    const tone = done === 'REJECTED' ? { bg: 'var(--red-50)', fg: 'var(--red-700)' } : done === 'COUNTERED' ? { bg: 'var(--blue-50)', fg: 'var(--blue-700)' } : { bg: 'var(--green-50)', fg: 'var(--green-700)' }
    return (
      <div className="card px-5 py-4">
        <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: tone.bg, color: tone.fg }}>{label}</span>
      </div>
    )
  }

  return (
    <div className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{propertyTitle}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{location} · Buyer: {buyerName}</p>
          {message && <p className="mt-1 truncate text-xs italic" style={{ color: 'var(--text-3)' }}>&ldquo;{message}&rdquo;</p>}
        </div>
        <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(amount)}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await forwardOffer(withOfferId()); setDone('FORWARDED') })}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
          >
            <ArrowRightCircle size={13} /> Forward to Seller
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
            onClick={() => startTransition(async () => { await rejectOfferAsBackend(withOfferId()); setDone('REJECTED') })}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
          >
            <X size={13} /> Reject
          </button>
        </div>
      </div>

      {counterOpen && (
        <form
          action={(formData) => {
            startTransition(async () => {
              await counterOfferAsBackend(formData)
              setDone('COUNTERED')
            })
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input type="hidden" name="offerId" value={offerId} />
          <input
            type="number"
            name="counterAmount"
            value={counterAmount}
            onChange={(e) => setCounterAmount(e.target.value)}
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
