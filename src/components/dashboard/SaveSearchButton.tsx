'use client'

import { useState, useTransition } from 'react'
import { BookmarkPlus, Check } from 'lucide-react'
import { saveSearch } from '@/lib/actions/savedSearches'
import type { PropertyFilters } from '@/lib/data/propertySearch'

/** "Save this search" control for the browse page. Captures the currently-applied
 *  filters (passed from the server component) and persists them under an optional
 *  name. Collapsed to a button until clicked, then expands to a name field. */
export default function SaveSearchButton({ filters }: { filters: PropertyFilters }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  if (saved) {
    return (
      <span className="flex items-center gap-1 rounded-lg px-3 py-2 font-semibold" style={{ color: 'var(--accent-700)' }}>
        <Check size={14} /> Search saved
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      >
        <BookmarkPlus size={14} /> Save search
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        autoFocus
        className="rounded-lg border px-3 py-2 outline-none"
        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData()
            if (name.trim()) fd.set('name', name.trim())
            for (const [k, v] of Object.entries(filters)) {
              if (v !== undefined && v !== null && v !== '') fd.set(k, String(v))
            }
            await saveSearch(fd)
            setSaved(true)
          })
        }}
        className="btn-accent rounded-lg px-3 py-2 font-semibold disabled:opacity-60"
      >
        Save
      </button>
    </div>
  )
}
