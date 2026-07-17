'use client'

import { useState, useTransition } from 'react'
import { changePassword } from '@/lib/actions/profile'

export default function PasswordChangeForm() {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(formData) => {
        setSaved(false)
        setError(null)

        const newPassword = String(formData.get('newPassword') || '')
        const confirmPassword = String(formData.get('confirmPassword') || '')
        if (newPassword !== confirmPassword) {
          setError('New password and confirmation do not match.')
          return
        }

        startTransition(async () => {
          try {
            await changePassword(formData)
            setSaved(true)
            ;(document.getElementById('password-change-form') as HTMLFormElement | null)?.reset()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to change password')
          }
        })
      }}
      id="password-change-form"
      className="card max-w-md p-6"
      data-animate="fade-up"
    >
      <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Change Password</h2>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Current Password</label>
        <input name="currentPassword" type="password" required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>New Password</label>
        <input name="newPassword" type="password" required minLength={8} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
      </div>
      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Confirm New Password</label>
        <input name="confirmPassword" type="password" required minLength={8} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
      </div>

      {error && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
          Password updated.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
        {pending ? 'Saving...' : 'Update password'}
      </button>
    </form>
  )
}
