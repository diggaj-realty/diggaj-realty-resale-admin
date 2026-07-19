'use client'

import { useState, useTransition } from 'react'
import { updateNotificationPrefs } from '@/lib/actions/profile'

export default function NotificationPrefsForm({
  emailNotifications,
  pushNotifications,
}: {
  emailNotifications: boolean
  pushNotifications: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) => {
        setSaved(false)
        startTransition(async () => {
          await updateNotificationPrefs(fd)
          setSaved(true)
        })
      }}
      className="card max-w-md p-6"
      data-animate="fade-up"
    >
      <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Notifications</h2>

      <label className="mb-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
        <input type="checkbox" name="pushNotifications" defaultChecked={pushNotifications} />
        In-app notifications
      </label>
      <label className="mb-5 flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
        <input type="checkbox" name="emailNotifications" defaultChecked={emailNotifications} />
        Email notifications
      </label>

      {saved && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
          Preferences saved.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
        {pending ? 'Saving...' : 'Save preferences'}
      </button>
    </form>
  )
}
