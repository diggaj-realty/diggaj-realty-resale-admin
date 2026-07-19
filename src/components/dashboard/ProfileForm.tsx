'use client'

import { useState, useTransition } from 'react'
import { updateProfile } from '@/lib/actions/profile'

export default function ProfileForm({ name, phone, email, avatarUrl }: { name: string; phone: string | null; email: string; avatarUrl: string | null }) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(formData) => {
        setSaved(false)
        startTransition(async () => {
          await updateProfile(formData)
          setSaved(true)
        })
      }}
      className="card max-w-md p-6"
      data-animate="fade-up"
    >
      <div className="mb-4 flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full border object-cover" style={{ borderColor: 'var(--line)' }} />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Profile Photo</label>
          <input type="file" name="avatar" accept="image/*" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }} />
        </div>
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Email</label>
        <input disabled value={email} className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: 'var(--line)', color: 'var(--text-3)', background: 'var(--surface-2)' }} />
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Full Name</label>
        <input name="name" defaultValue={name} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
      </div>
      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Phone</label>
        <input name="phone" defaultValue={phone ?? ''} placeholder="Add a phone number" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
      </div>

      {saved && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
          Profile updated.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
        {pending ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  )
}
