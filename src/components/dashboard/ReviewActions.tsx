'use client'

import { useTransition } from 'react'
import { Check, X } from 'lucide-react'

export default function ReviewActions({
  action,
  hiddenFields,
  approveValue = 'APPROVED',
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
}: {
  action: (formData: FormData) => Promise<void>
  hiddenFields: Record<string, string>
  approveValue?: string
  approveLabel?: string
  rejectLabel?: string
}) {
  const [pending, startTransition] = useTransition()

  function submit(decision: string) {
    const fd = new FormData()
    Object.entries(hiddenFields).forEach(([k, v]) => fd.set(k, v))
    fd.set('decision', decision)
    startTransition(() => action(fd))
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => submit(approveValue)}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
      >
        <Check size={13} /> {approveLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => submit('REJECTED')}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
      >
        <X size={13} /> {rejectLabel}
      </button>
    </div>
  )
}
