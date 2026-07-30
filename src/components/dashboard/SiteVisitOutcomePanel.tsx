'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Handshake } from 'lucide-react'
import { recordSiteVisitOutcome, createDealFromSiteVisit } from '@/lib/actions/siteVisits'
import { formatINR } from '@/lib/format'
import {
  SELECTABLE_VISIT_OUTCOMES,
  VISIT_OUTCOME_LABELS,
  outcomeNeedsAmount,
  type VisitOutcome,
} from '@/lib/visitOutcomes'

/** Post-visit outcome + in-person deal creation — negotiation happens face to
 *  face on the visit itself, never online, so this just records what was agreed
 *  and (once ready) creates the Deal directly, skipping the online
 *  offer/counter-offer flow entirely. Outcome/amount can be updated repeatedly
 *  (further in-person rounds) right up until the deal is created.
 *
 *  One step, not two: recording the outcome also completes the visit, because an
 *  agent walking out of a flat wants a single form — what happened, at what price,
 *  what next — rather than marking it complete first and then being allowed to say
 *  how it went. */
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
  const [feedback, setFeedback] = useState('')

  function runOutcome(nextOutcome: VisitOutcome) {
    setError(null)
    const fd = new FormData()
    fd.set('id', visitId)
    fd.set('outcome', nextOutcome)
    if (feedback.trim()) fd.set('feedback', feedback)
    if (outcomeNeedsAmount(nextOutcome)) fd.set('interestedAmount', amount)
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
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            What happened at the visit?
          </span>
          {/* The whole vocabulary, not just interested/not: a no-show, a failed
              visit and a buyer still deciding are different things and used to
              collapse into one vague "follow up" bucket. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SELECTABLE_VISIT_OUTCOMES.map((o) => {
              const active = outcome === o
              const positive = o === 'INTERESTED' || o === 'NEGOTIATING'
              const negative = o === 'NOT_INTERESTED'
              const bg = positive ? 'var(--green-50)' : negative ? 'var(--red-50)' : 'var(--surface-2)'
              const fg = positive ? 'var(--green-700)' : negative ? 'var(--red-700)' : 'var(--text-2)'
              return (
                <button
                  key={o}
                  type="button"
                  disabled={pending}
                  onClick={() => runOutcome(o)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={
                    active
                      ? { background: fg, color: '#fff' }
                      : { background: bg, color: fg }
                  }
                >
                  {VISIT_OUTCOME_LABELS[o]}
                </button>
              )
            })}
          </div>

          {outcome && outcomeNeedsAmount(outcome) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {outcome === 'INTERESTED' ? 'Agreed at' : 'Currently discussing'}
              </span>
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
                onClick={() => runOutcome(outcome as VisitOutcome)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              >
                Update amount
              </button>
            </div>
          )}

          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Notes from the visit (optional)"
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
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
