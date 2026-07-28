'use client'

import { useState, useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'
import { agentProposeSiteVisit } from '@/lib/actions/siteVisits'

/** Lets the assigned agent open a visit themselves.
 *
 *  Previously only a buyer could start one, so an agent who'd just got off the
 *  phone had nowhere to put a slot. This creates the visit as a *proposal* rather
 *  than a booking — the buyer still has to agree — so an agent can offer a time
 *  without silently committing someone else's diary. */
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
  const [open, setOpen] = useState(false)

  if (disabledReason) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {disabledReason}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-accent flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
      >
        <CalendarPlus size={13} /> Propose a site visit
      </button>
    )
  }

  return (
    <form
      action={(fd) => {
        setError(null)
        fd.set('interestId', interestId)
        startTransition(async () => {
          try {
            await agentProposeSiteVisit(fd)
            setOpen(false)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to propose the visit')
          }
        })
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          name="proposedDate"
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
          className="btn-accent rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
        >
          {pending ? 'Sending...' : 'Send proposal'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          Cancel
        </button>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
        {buyerName} can accept, decline, or suggest another time.
      </span>
      {error && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}
    </form>
  )
}
