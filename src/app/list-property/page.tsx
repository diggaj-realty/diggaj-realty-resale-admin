import { Building2 } from 'lucide-react'
import { getActiveAmenityNames } from '@/lib/data/amenities'
import PublicListingForm from '@/components/public/PublicListingForm'

export const metadata = {
  title: 'List Your Property — Diggaj Realty',
  description: 'Submit your property details for review. No account needed.',
}

export default async function PublicListingPage() {
  const amenityOptions = await getActiveAmenityNames()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: 'var(--ink-800)', color: 'var(--cream)' }}
        >
          <Building2 size={18} />
        </span>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>List Your Property</h1>
        <p className="max-w-lg text-sm" style={{ color: 'var(--text-2)' }}>
          Fill in your property details and photos below — no sign-up required. Our team will review your
          submission and reach out once it&apos;s verified and live on Diggaj Realty.
        </p>
      </div>

      <PublicListingForm amenityOptions={amenityOptions} />
    </div>
  )
}
