'use client'

import { useState, useTransition } from 'react'
import { Building2, HandCoins } from 'lucide-react'
import { makeOffer } from '@/lib/actions/offers'
import { formatINR } from '@/lib/format'

export default function MakeOfferRow({
  propertyId,
  title,
  location,
  askingPrice,
  detail,
}: {
  propertyId: string
  title: string
  location: string
  askingPrice: number
  detail?: string
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(askingPrice))
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="rounded-xl border px-4 py-3.5" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-4">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}
        >
          <Building2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{title}</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{location}{detail ? ` · ${detail}` : ''}</p>
        </div>
        <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
          {formatINR(askingPrice)}
        </span>
        {sent ? (
          <span className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
            Offer sent
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
          >
            <HandCoins size={13} /> Make Offer
          </button>
        )}
      </div>

      {open && !sent && (
        <form
          action={(formData) => {
            startTransition(async () => {
              await makeOffer(formData)
              setSent(true)
              setOpen(false)
            })
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input type="hidden" name="propertyId" value={propertyId} />
          <input
            type="number"
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            className="w-40 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
          <input
            type="text"
            name="message"
            placeholder="Message to seller (optional)"
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            disabled={pending}
            className="btn-accent rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
          >
            {pending ? 'Sending...' : 'Submit Offer'}
          </button>
        </form>
      )}
    </div>
  )
}
