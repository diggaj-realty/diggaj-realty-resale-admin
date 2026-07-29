'use client'

import { useState, useTransition } from 'react'
import { CalendarPlus, CalendarCheck, Phone } from 'lucide-react'
import { agentProposeSiteVisit, bookAgreedSiteVisit } from '@/lib/actions/siteVisits'

type Mode = 'PROPOSE' | 'AGREED'

/** Lets staff open a visit on a lead, in the two ways a visit actually gets set.
 *
 *  *Propose* offers a time and waits for the buyer to accept, which is right when
 *  nobody has spoken. *Already agreed on a call* books it outright, which is right
 *  after a call where the slot was settled — otherwise the agent has to ask the
 *  buyer to confirm in an app what they just confirmed out loud, and the visit
 *  sits unbooked meanwhile.
 *
 *  The second is one party asserting the other's consent, so it is recorded as
 *  AGREED_OFFLINE and the buyer is told it was booked for them and given a way to
 *  dispute it. Without that distinction, booking on someone's behalf is simply
 *  taking their diary. */
export default function ProposeSiteVisitForm({
  interestId,
  buyerName,
  disabledReason,
}: {
  interestId: string
  buyerName: string
  disabledReason?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)

  if (disabledReason) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {disabledReason}
      </p>
    )
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('PROPOSE')}
          className="btn-accent flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        >
          <CalendarPlus size={13} /> Propose a site visit
        </button>
        <button
          type="button"
          onClick={() => setMode('AGREED')}
          className="flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          <Phone size={13} /> Already agreed on a call
        </button>
      </div>
    )
  }

  const isAgreed = mode === 'AGREED'

  return (
    <form
      action={(fd) => {
        setError(null)
        fd.set('interestId', interestId)
        startTransition(async () => {
          try {
            await (isAgreed ? bookAgreedSiteVisit(fd) : agentProposeSiteVisit(fd))
            setMode(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not set up the visit')
          }
        })
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          name={isAgreed ? 'scheduledDate' : 'proposedDate'}
          required
          className="rounded-lg border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
        />
        <input
          name="note"
          placeholder="Note for the buyer (optional)"
          className="w-56 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
        />
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
          style={
            isAgreed
              ? { background: 'var(--green-50)', color: 'var(--green-700)' }
              : { background: 'var(--accent-700)', color: '#fff' }
          }
        >
          {isAgreed ? <CalendarCheck size={12} /> : null}
          {pending ? 'Saving...' : isAgreed ? 'Book it' : 'Send proposal'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(null); setError(null) }}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          Cancel
        </button>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
        {isAgreed
          ? `${buyerName} is told this was booked following your call, and can flag it if it is wrong.`
          : `${buyerName} can accept, decline, or suggest another time.`}
      </span>
      {error && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}
    </form>
  )
}
