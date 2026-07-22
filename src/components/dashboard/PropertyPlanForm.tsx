'use client'

import { useTransition } from 'react'
import { updatePropertyPlan } from '@/lib/actions/backend'

const PLANS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'VERIFIED_PLUS', label: 'Premium (Verified+)' },
  { value: 'ELITE', label: 'Elite' },
]

export default function PropertyPlanForm({ propertyId, currentPlan }: { propertyId: string; currentPlan: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => startTransition(() => updatePropertyPlan(formData))}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <select
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
