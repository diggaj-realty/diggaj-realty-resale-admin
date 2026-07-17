'use client'

import { useTransition } from 'react'
import { assignAgent } from '@/lib/actions/admin'

export default function AgentAssignSelect({
  dealId,
  agentId,
  agents,
}: {
  dealId: string
  agentId: string | null
  agents: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData()
    fd.set('dealId', dealId)
    fd.set('agentId', e.target.value)
    startTransition(() => assignAgent(fd))
  }

  return (
    <span onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <select
        defaultValue={agentId ?? ''}
        onChange={onChange}
        disabled={pending}
        className="rounded-lg border px-2 py-1.5 text-xs font-medium outline-none disabled:opacity-60"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <option value="" disabled>
          Assign agent…
        </option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </span>
  )
}
