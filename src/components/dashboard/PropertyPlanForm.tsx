'use client'

import { useTransition } from 'react'
import { updatePropertyPlan, reviewPlanRequest } from '@/lib/actions/backend'

const PLANS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'ELITE', label: 'Elite' },
]

export default function PropertyPlanForm({
  propertyId,
  currentPlan,
  requestedPlan,
}: {
  propertyId: string
  currentPlan: string
  requestedPlan?: string | null
}) {
  const [pending, startTransition] = useTransition()

  function review(decision: 'APPROVE' | 'REJECT') {
    const fd = new FormData()
    fd.set('propertyId', propertyId)
    fd.set('decision', decision)
    startTransition(() => reviewPlanRequest(fd))
  }

  if (requestedPlan) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
          Seller requested {requestedPlan.charAt(0) + requestedPlan.slice(1).toLowerCase()} (currently {currentPlan.charAt(0) + currentPlan.slice(1).toLowerCase()})
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => review('APPROVE')}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => review('REJECT')}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
        >
          Decline
        </button>
      </div>
    )
  }

  return (
    <form
      action={(formData) => startTransition(() => updatePropertyPlan(formData))}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <select
        key={currentPlan}
        name="plan"
        defaultValue={currentPlan}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        {PLANS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn-accent whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-70"
      >
        {pending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
