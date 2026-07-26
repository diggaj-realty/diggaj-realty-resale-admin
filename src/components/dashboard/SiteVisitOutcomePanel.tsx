'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ThumbsUp, ThumbsDown, Handshake } from 'lucide-react'
import { recordSiteVisitOutcome, createDealFromSiteVisit } from '@/lib/actions/siteVisits'
import { formatINR } from '@/lib/format'

/** Post-visit outcome + in-person deal creation — negotiation happens face to
 *  face on the visit itself, never online, so this just records what was
 *  agreed and (once ready) creates the Deal directly, skipping the online
 *  offer/counter-offer flow entirely. Outcome/amount can be updated
 *  repeatedly (further in-person rounds) right up until the deal is created. */
export default function SiteVisitOutcomePanel({
  visitId,
  outcome,
  interestedAmount,
  askingPrice,
  dealId,
  canRecordOutcome,
  canCreateDeal,
}: {
  visitId: string
  outcome: string | null
  interestedAmount: number | null
  askingPrice: number
  dealId: string | null
  canRecordOutcome: boolean
  canCreateDeal: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState(String(interestedAmount ?? askingPrice))

  function runOutcome(nextOutcome: 'INTERESTED' | 'NOT_INTERESTED') {
    setError(null)
    const fd = new FormData()
    fd.set('id', visitId)
    fd.set('outcome', nextOutcome)
    if (nextOutcome === 'INTERESTED') fd.set('interestedAmount', amount)
    startTransition(async () => {
      try {
        await recordSiteVisitOutcome(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save outcome')
      }
    })
  }

  function runCreateDeal() {
    setError(null)
    const fd = new FormData()
    fd.set('id', visitId)
    startTransition(async () => {
      try {
        await createDealFromSiteVisit(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create deal')
      }
    })
  }

  if (dealId) {
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        <Link href={`/dashboard/deals/${dealId}`} className="text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>
          Deal created from this visit — open it →
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      {canRecordOutcome && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => runOutcome('INTERESTED')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{
              background: outcome === 'INTERESTED' ? 'var(--green-500)' : 'var(--green-50)',
              color: outcome === 'INTERESTED' ? '#fff' : 'var(--green-700)',
            }}
          >
            <ThumbsUp size={13} /> Interested
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runOutcome('NOT_INTERESTED')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{
              background: outcome === 'NOT_INTERESTED' ? 'var(--red-500)' : 'var(--red-50)',
              color: outcome === 'NOT_INTERESTED' ? '#fff' : 'var(--red-700)',
            }}
          >
            <ThumbsDown size={13} /> Not interested
          </button>

          {outcome === 'INTERESTED' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>at</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => runOutcome('INTERESTED')}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              >
                Update amount
              </button>
            </div>
          )}
        </div>
      )}

      {!canRecordOutcome && outcome === 'INTERESTED' && (
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          Interested at {formatINR(interestedAmount ?? askingPrice)}
        </p>
      )}
      {!canRecordOutcome && outcome === 'NOT_INTERESTED' && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Buyer was not interested after the visit.</p>
      )}
      {!canRecordOutcome && !outcome && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Waiting on the agent to log the visit outcome.</p>
      )}

      {outcome === 'INTERESTED' && canCreateDeal && (
        <button
          type="button"
          disabled={pending}
          onClick={runCreateDeal}
          className="btn-accent flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-70"
        >
          <Handshake size={13} /> {pending ? 'Creating deal...' : `Create deal at ${formatINR(Number(amount) || askingPrice)}`}
        </button>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}
    </div>
  )
}
