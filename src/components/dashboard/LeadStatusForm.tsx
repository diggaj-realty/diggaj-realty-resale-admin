'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { updateLeadStatus } from '@/lib/actions/interests'

/** Statuses staff can set by hand.
 *
 *  CONVERTED_TO_DEAL is absent on purpose: it's a consequence of a deal actually
 *  being created, so offering it here would let a lead claim a deal that doesn't
 *  exist. The visit-driven statuses are also absent — those follow the visit
 *  record automatically, and setting them by hand would let the lead disagree
 *  with the visit it's derived from. */
const SETTABLE = [
  'CONTACT_IN_PROGRESS',
  'INTERESTED',
  'NOT_INTERESTED',
  'NEGOTIATION_IN_PROGRESS',
  'CLOSED',
  'CANCELLED',
] as const

export default function LeadStatusForm({ interestId, status }: { interestId: string; status: string }) {
  const [selected, setSelected] = useState(status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function submit() {
    if (!selected || selected === status) return
    setError(null)
    setDone(false)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('interestId', interestId)
        fd.set('status', selected)
        await updateLeadStatus(fd)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update status')
      }
    })
  }

  // A lead already driven past these by its visit or deal shouldn't be dragged
  // backwards from a dropdown.
  const options = SETTABLE.includes(status as (typeof SETTABLE)[number]) ? SETTABLE : [status, ...SETTABLE]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border px-2.5 py-2 text-xs capitalize outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        {options.map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || selected === status}
        onClick={submit}
        className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Update'}
      </button>
      {done && <CheckCircle2 size={14} style={{ color: 'var(--green-700)' }} />}
      {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </div>
  )
}
