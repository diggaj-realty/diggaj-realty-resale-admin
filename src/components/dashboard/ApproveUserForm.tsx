'use client'

import { useTransition } from 'react'
import { approveUser } from '@/lib/actions/admin'

export default function ApproveUserForm({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(() => approveUser(formData))
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue="AGENT"
        disabled={pending}
        className="rounded-lg border px-2 py-1 text-xs outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <option value="AGENT">Agent</option>
        <option value="BACKEND">Backend Ops</option>
        <option value="ADMIN">Admin</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn-accent rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60"
      >
        {pending ? 'Approving...' : 'Approve'}
      </button>
    </form>
  )
}
