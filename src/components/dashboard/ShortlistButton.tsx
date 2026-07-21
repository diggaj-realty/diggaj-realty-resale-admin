'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { toggleShortlist } from '@/lib/actions/shortlists'

/** Heart toggle for a property. Optimistic: flips immediately, reconciles with
 *  the server action's returned state. Used on browse rows and the shortlist page. */
export default function ShortlistButton({
  propertyId,
  initialShortlisted,
  size = 16,
}: {
  propertyId: string
  initialShortlisted: boolean
  size?: number
}) {
  const [shortlisted, setShortlisted] = useState(initialShortlisted)
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
      disabled={pending}
      onClick={() => {
        const next = !shortlisted
        setShortlisted(next) // optimistic
        startTransition(async () => {
          try {
            const fd = new FormData()
            fd.set('propertyId', propertyId)
            const res = await toggleShortlist(fd)
            setShortlisted(res.shortlisted)
          } catch {
            setShortlisted(!next) // revert on failure
          }
        })
      }}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition disabled:opacity-60"
      style={{
        background: shortlisted ? 'var(--red-50, #fef2f2)' : 'var(--surface)',
        border: '1px solid var(--line)',
        color: shortlisted ? '#e11d48' : 'var(--text-3)',
      }}
    >
      <Heart size={size} fill={shortlisted ? 'currentColor' : 'none'} />
    </button>
  )
}
