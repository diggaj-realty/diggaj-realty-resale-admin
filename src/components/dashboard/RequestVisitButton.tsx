'use client'

import { useState, useTransition } from 'react'
import { CalendarCheck, Check } from 'lucide-react'
import { requestSiteVisit } from '@/lib/actions/siteVisits'

/** Buyer control to request a site visit for a property. Collapses to a button;
 *  expands to a date+note form. Mirrors the inline make-offer UX on browse rows. */
export default function RequestVisitButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (requested) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>
        <Check size={13} /> Visit requested
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <CalendarCheck size={13} /> Request visit
      </button>
    )
  }

  return (
    <form
      action={(fd) => {
        setError(null)
        fd.set('propertyId', propertyId)
        startTransition(async () => {
          try {
            await requestSiteVisit(fd)
            setRequested(true)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not request visit')
          }
        })
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="datetime-local"
        name="requestedDate"
        required
        className="rounded-lg border px-2.5 py-2 text-xs outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      />
      <input
        type="text"
        name="buyerNote"
        placeholder="Note (optional)"
        className="rounded-lg border px-2.5 py-2 text-xs outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      />
      <button type="submit" disabled={pending} className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60">
        Request
      </button>
      {error && <span className="text-xs" style={{ color: '#e11d48' }}>{error}</span>}
    </form>
  )
}
