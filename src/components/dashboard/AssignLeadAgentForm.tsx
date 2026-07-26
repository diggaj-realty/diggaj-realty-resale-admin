'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { assignLeadAgent } from '@/lib/actions/interests'

/** Controlled select + explicit submit, matching the other assignment forms.
 *  An uncontrolled select with a disabled placeholder can silently submit the
 *  wrong agent depending on the browser, which is exactly the bug this pattern
 *  exists to avoid. */
export default function AssignLeadAgentForm({
  interestId,
  agentId,
  agents,
}: {
  interestId: string
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
        fd.set('interestId', interestId)
        fd.set('agentId', selected)
        await assignLeadAgent(fd)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign agent')
      }
    })
  }

  if (agents.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--amber-700)' }}>
        No active agents exist yet — create one before assigning leads.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        {pending ? 'Saving...' : agentId ? 'Reassign' : 'Assign'}
      </button>
      {done && <CheckCircle2 size={14} style={{ color: 'var(--green-700)' }} />}
      {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </div>
  )
}
