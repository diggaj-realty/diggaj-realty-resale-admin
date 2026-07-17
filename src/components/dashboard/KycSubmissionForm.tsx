'use client'

import { useRef, useState, useTransition } from 'react'
import { UploadCloud } from 'lucide-react'
import { submitKyc } from '@/lib/actions/kyc'

const ID_TYPES = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENCE', label: 'Driving Licence' },
]

export default function KycSubmissionForm({ resubmit = false }: { resubmit?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await submitKyc(formData)
        formRef.current?.reset()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="card space-y-4 p-6" data-animate="fade-up">
      <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        {resubmit ? 'Resubmit KYC Documents' : 'Submit KYC Documents'}
      </h2>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ID Type</label>
        <select
          name="idType"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        >
          <option value="">Select an ID type…</option>
          {ID_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ID Document</label>
        <input
          type="file"
          name="idDocFile"
          accept="image/*,application/pdf"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        />
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Image or PDF, max 5MB.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Selfie</label>
        <input
          type="file"
          name="selfieFile"
          accept="image/*"
          capture="user"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        />
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Image only, max 5MB.</p>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-accent flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-70"
      >
        <UploadCloud size={15} />
        {pending ? 'Submitting...' : resubmit ? 'Resubmit for Review' : 'Submit for Review'}
      </button>
    </form>
  )
}
