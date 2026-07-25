import { Ruler, MapPin, IndianRupee, BedDouble } from 'lucide-react'
import StatusPill from './StatusPill'
import { formatINR } from '@/lib/format'

export interface DashboardHeroBannerProps {
  eyebrow: string
  title: string
  location: string
  photoUrl: string | null
  askingPrice: number
  areaSqft: number
  bhk: number | null
  type: string
  /** Property status (LIVE/DRAFT/PENDING_VERIFICATION/...) — shown as a pill next
   *  to the title whenever it's anything other than LIVE, so a featured listing
   *  that hasn't been approved yet is never mistaken for one that has. */
  status?: string
}

/** Solid indigo color-block hero — the property photo bleeds in from the right
 *  over a flat accent-colored panel, title and info row sit on the left in
 *  white. Photo fades into the color block via a soft edge gradient instead of
 *  a hard crop, so it reads as one composed banner rather than an image with
 *  text slapped on top. */
export default function DashboardHeroBanner({
  eyebrow,
  title,
  location,
  photoUrl,
  askingPrice,
  areaSqft,
  bhk,
  type,
  status,
}: DashboardHeroBannerProps) {
  return (
    <div
      className="relative mb-6 h-[300px] overflow-hidden rounded-[28px] sm:h-[320px]"
      style={{ background: 'var(--accent-600)', boxShadow: 'var(--elev-2)' }}
      data-animate="fade-up"
    >
      {photoUrl && (
        <>
          <div className="absolute inset-y-0 right-0 w-full sm:w-[58%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={title} loading="eager" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/10" />
          </div>
          {/* Soft blend from the solid color block into the photo, rather than a hard
              edge — wide enough on mobile to cover the whole text column (text has no
              width cap below sm, so the blend has to reach as far as the text does,
              not just a decorative corner sliver). */}
          <div
            className="absolute inset-y-0 left-0 hidden w-40 sm:block"
            style={{ background: 'linear-gradient(90deg, var(--accent-600) 0%, rgba(61,79,196,0) 100%)' }}
          />
          <div
            className="absolute inset-y-0 left-0 w-[78%] sm:hidden"
            style={{ background: 'linear-gradient(90deg, var(--accent-600) 0%, var(--accent-600) 55%, rgba(61,79,196,0) 100%)' }}
          />
        </>
      )}

      <div className="relative flex h-full flex-col justify-center gap-3 px-6 py-6 max-w-[80%] sm:max-w-[46%] sm:px-9">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/65">{eyebrow}</p>
          {status && status !== 'LIVE' && <StatusPill status={status} />}
        </div>

        <h1
          className="text-3xl font-bold leading-[1.08] text-white sm:text-4xl"
          style={{ letterSpacing: 'var(--tracking-heading)' }}
        >
          {title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-medium text-white/80">
          <span className="flex items-center gap-1.5">
            <Ruler size={14} /> {areaSqft.toLocaleString('en-IN')} sqft
          </span>
          <span className="text-white/30">·</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="truncate">{location}</span>
          </span>
          <span className="text-white/30">·</span>
          <span className="flex items-center gap-1.5">
            <IndianRupee size={14} /> {formatINR(askingPrice)}
          </span>
          {bhk != null && (
            <>
              <span className="text-white/30">·</span>
              <span className="flex items-center gap-1.5">
                <BedDouble size={14} /> {bhk} BHK
              </span>
            </>
          )}
          {bhk == null && (
            <>
              <span className="text-white/30">·</span>
              <span>{type}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
