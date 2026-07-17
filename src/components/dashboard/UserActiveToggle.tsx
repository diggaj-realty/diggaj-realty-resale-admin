'use client'

import { useTransition } from 'react'
import { toggleUserActive } from '@/lib/actions/admin'

export default function UserActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    const fd = new FormData()
    fd.set('userId', userId)
    fd.set('nextActive', String(!isActive))
    startTransition(() => toggleUserActive(fd))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity disabled:opacity-60"
      style={{
        background: isActive ? 'var(--green-50)' : 'var(--red-50)',
        color: isActive ? 'var(--green-700)' : 'var(--red-700)',
      }}
    >
      {isActive ? 'Active' : 'Inactive'}
    </button>
  )
}
