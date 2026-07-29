'use client'

import { useState, useTransition } from 'react'
import { HandGrab } from 'lucide-react'
import { claimLead } from '@/lib/actions/interests'

/** Lets an agent take an unassigned lead.
 *
 *  Assignment was push-only, so an agent browsing the unassigned pool could see
 *  work they were willing to do and had to wait for staff to hand it over. Only
 *  ever shown on leads nobody owns — taking someone else's is a reassignment, and
 *  that stays a staff decision. */
export default function ClaimLeadButton({ interestId }: { interestId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          // The row is a link to the lead; claiming shouldn't navigate away from
          // the queue the agent is working through.
          e.preventDefault()
          e.stopPropagation()
          setError(null)
          const fd = new FormData()
          fd.set('interestId', interestId)
          start(async () => {
            try {
              await claimLead(fd)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not claim this lead')
            }
          })
        }}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
      >
        <HandGrab size={12} /> {pending ? 'Claiming...' : 'Claim'}
      </button>
      {error && <span className="text-[11px]" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </span>
  )
}
