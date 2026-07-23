import { getActiveAmenityNames } from '@/lib/data/amenities'
import PublicListingForm from '@/components/public/PublicListingForm'

export const metadata = {
  title: 'List Your Property — Diggaj Realty',
  description: 'Submit your property details for review. No account needed.',
}

/** The real seller-intake form. Canonical URL is list.diggajrealty.com/ (see
 *  proxy.ts, which rewrites that domain's root here) — a dedicated custom
 *  domain on this same Vercel project, avoiding the flaky cross-project
 *  rewrite diggajrealty.com/list-property used to depend on. Still lives
 *  under /embed for backward compatibility with that old rewrite path.
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
