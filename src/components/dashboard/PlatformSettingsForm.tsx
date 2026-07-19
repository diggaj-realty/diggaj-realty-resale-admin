'use client'

import { useState, useTransition } from 'react'
import { updateAppConfig } from '@/lib/actions/appConfig'

export default function PlatformSettingsForm({
  commissionPercent,
  kycAutoApproveEnabled,
  listingApprovalRequired,
  supportEmail,
}: {
  commissionPercent: number
  kycAutoApproveEnabled: boolean
  listingApprovalRequired: boolean
  supportEmail: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(formData) => {
        setSaved(false)
        setError(null)
        startTransition(async () => {
          try {
            await updateAppConfig(formData)
            setSaved(true)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.')
          }
        })
      }}
      className="card max-w-md p-6"
      data-animate="fade-up"
    >
      <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Platform Settings</h2>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Commission (%)</label>
        <input
          type="number"
          name="commissionPercent"
          min={0}
          max={100}
          step="0.1"
          defaultValue={commissionPercent}
          required
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Support Email</label>
        <input
          type="email"
          name="supportEmail"
          defaultValue={supportEmail ?? ''}
          placeholder="support@example.com"
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
        />
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
        <input type="checkbox" name="listingApprovalRequired" defaultChecked={listingApprovalRequired} />
        Require backend approval before listings go live
      </label>

      <label className="mb-5 flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
        <input type="checkbox" name="kycAutoApproveEnabled" defaultChecked={kycAutoApproveEnabled} />
        Auto-approve KYC submissions
      </label>

      {error && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
          Platform settings updated.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
        {pending ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  )
}
