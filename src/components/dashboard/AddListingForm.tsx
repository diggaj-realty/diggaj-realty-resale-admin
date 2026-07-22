'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { createListing } from '@/lib/actions/listings'
import PropertyRichFields from './PropertyRichFields'

const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'PLOT', label: 'Plot' },
  { value: 'COMMERCIAL', label: 'Commercial' },
]

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }

export default function AddListingForm({ amenityOptions }: { amenityOptions: string[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState('RESIDENTIAL')
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createListing(formData)
        formRef.current?.reset()
        router.push('/dashboard/listings')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="card space-y-5 p-6" data-animate="fade-up">
      <div className="flex items-center gap-2">
        <Building2 size={18} style={{ color: 'var(--accent-700)' }} />
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Property Details</h2>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Title</label>
        <input type="text" name="title" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Description</label>
        <textarea name="description" rows={3} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Location</label>
        <input type="text" name="location" required placeholder="Area, City" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Type</label>
          <select
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Area (sqft)</label>
          <input type="number" name="areaSqft" min={1} required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: type === 'PLOT' ? 'var(--text-3)' : 'var(--text-2)' }}>BHK</label>
          <input
            type="number"
            name="bhk"
            min={1}
            disabled={type === 'PLOT'}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Asking Price (₹)</label>
        <input type="number" name="askingPrice" min={1} required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Photos</label>
        <input type="file" name="photos" accept="image/*" multiple className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }} />
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Optional, multiple images allowed, max 15MB each.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Videos</label>
        <input type="file" name="videos" accept="video/*" multiple className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }} />
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Optional, multiple videos allowed, max 20MB each.</p>
      </div>

      <PropertyRichFields amenityOptions={amenityOptions} />

      {error && (
        <p className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-70"
      >
        {pending ? 'Submitting...' : 'Submit Listing'}
      </button>
    </form>
  )
}
