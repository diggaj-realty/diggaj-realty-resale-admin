'use client'

import { useTransition } from 'react'
import { assignAgentToProperty } from '@/lib/actions/admin'

export default function AssignAgentForm({
  propertyId,
  agents,
  currentAgentId,
}: {
  propertyId: string
  agents: { id: string; name: string }[]
  currentAgentId: string | null
}) {
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => startTransition(() => assignAgentToProperty(formData))}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <select
        name="agentId"
        defaultValue={currentAgentId ?? ''}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <option value="" disabled>Select an agent</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn-accent whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-70"
      >
        {pending ? 'Saving...' : 'Assign'}
      </button>
    </form>
  )
}
