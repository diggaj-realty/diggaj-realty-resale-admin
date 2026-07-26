'use client'

import { useState, useTransition } from 'react'
import { XCircle } from 'lucide-react'
import { closeNegotiation } from '@/lib/actions/offers'

/** Lets backend end a stalled negotiation without an agreement — separate
 *  from reject/counter, which only the buyer/seller (not staff) can do
 *  mid-negotiation. Staff's only power here is to call it off entirely. */
export default function CloseNegotiationButton({ offerId }: { offerId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          const fd = new FormData()
          fd.set('offerId', offerId)
          startTransition(async () => {
            try {
              await closeNegotiation(fd)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to close negotiation')
            }
          })
        }}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
      >
        <XCircle size={13} /> {pending ? 'Closing...' : 'Close negotiation'}
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </span>
  )
}
