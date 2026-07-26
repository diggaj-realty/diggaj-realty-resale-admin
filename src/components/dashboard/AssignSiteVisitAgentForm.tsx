'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { assignSiteVisitAgent } from '@/lib/actions/siteVisits'

/** Rebuilt as a controlled client component — the previous version was a
 *  plain uncontrolled <select> with a disabled placeholder option matching
 *  `defaultValue=""`. That combination behaves inconsistently across
 *  browsers about what's actually "selected" before the user interacts with
 *  it, which could make Assign/Reassign silently submit the wrong agent (or
 *  appear to do nothing). This version tracks the selection explicitly,
 *  disables submit until a real agent is chosen, and shows a clear
 *  confirmation once the assignment actually goes through. */
export default function AssignSiteVisitAgentForm({
  visitId,
  agentId,
  agents,
}: {
  visitId: string
  agentId: string | null
  agents: { id: string; name: string }[]
}) {
  const [selected, setSelected] = useState(agentId ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function submit() {
    if (!selected) return
    setError(null)
    setDone(false)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', visitId)
        fd.set('agentId', selected)
        await assignSiteVisitAgent(fd)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign agent')
      }
    })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border px-2.5 py-2 text-xs outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <option value="">Select an agent</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || pending}
        onClick={submit}
        className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : agentId ? 'Reassign' : 'Assign agent'}
      </button>
      {done && (
        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--green-700)' }}>
          <CheckCircle2 size={13} /> Assigned
        </span>
      )}
      {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </div>
  )
}
