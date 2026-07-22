'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteListing } from '@/lib/actions/media'

export default function DeleteListingButton({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!confirm('Delete this listing permanently? This will remove all its photos and videos too. This cannot be undone.')) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteListing((() => {
          const fd = new FormData()
          fd.set('propertyId', propertyId)
          return fd
        })())
      } catch (err) {
        // Next.js redirect() throws a special NEXT_REDIRECT error that must propagate, not be swallowed.
        if (err && typeof err === 'object' && 'digest' in err && String(err.digest).startsWith('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Failed to delete listing.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
      >
        <Trash2 size={13} /> {pending ? 'Deleting...' : 'Delete Listing'}
      </button>
      {error && (
        <p className="text-xs font-medium" style={{ color: 'var(--red-700)' }}>{error}</p>
      )}
    </div>
  )
}
