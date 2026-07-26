'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { assignAgent } from '@/lib/actions/admin'

/** Controlled replacement for the old AgentAssignSelect, which was a plain
 *  uncontrolled <select> with a disabled placeholder option matching
 *  `defaultValue=""` — that combination could silently submit the wrong
 *  agent (or appear to do nothing) depending on browser behavior. This
 *  version tracks the selection explicitly and requires an explicit submit. */
export default function AssignDealAgentForm({
  dealId,
  agentId,
  agents,
}: {
  dealId: string
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
        fd.set('dealId', dealId)
        fd.set('agentId', selected)
        await assignAgent(fd)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign agent')
      }
    })
  }

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex items-center gap-1.5"
    >
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border px-2 py-1.5 text-xs font-medium outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <option value="">Select an agent</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || pending}
        onClick={submit}
        className="btn-accent rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : agentId ? 'Reassign' : 'Assign'}
      </button>
      {done && <CheckCircle2 size={14} style={{ color: 'var(--green-700)' }} />}
      {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
    </span>
  )
}
