import { getActiveAmenityNames } from '@/lib/data/amenities'
import PublicListingForm from '@/components/public/PublicListingForm'

export const metadata = {
  title: 'List Your Property — Diggaj Realty',
  description: 'Submit your property details for review. No account needed.',
}

/** The real seller-intake form. Lives under /embed so it can be proxied from
 *  diggajrealty.com/list-property (see vercel.json in the diggaj-realty-resale
 *  repo) without /list-property on this domain also needing to redirect —
 *  that path just forwards visitors to the canonical diggajrealty.com URL.
 *  Visual language (cream hero, lime accent, pill inputs) is matched to the
 *  diggajrealty.com marketing site rather than this app's own dashboard. */
export default async function PublicListingPage() {
  const amenityOptions = await getActiveAmenityNames()

  return (
    <main className="min-h-screen bg-white">
      <div className="bg-[#f4efe5] pb-14">
        <div className="mx-auto max-w-3xl px-6 pt-14 md:px-8">
          <h1 className="max-w-2xl text-4xl font-medium tracking-[-0.03em] text-[#1c1a16] md:text-5xl">
            List your property
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#1c1a16]/70">
            No sign-up, no waiting on hold — just tell us about the place and add a few photos. A real
            person on our team reviews every submission before it goes live.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12 md:px-8">
        <PublicListingForm amenityOptions={amenityOptions} />
      </div>
    </main>
  )
}
