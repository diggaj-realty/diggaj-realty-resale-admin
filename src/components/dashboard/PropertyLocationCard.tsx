import { MapPin } from 'lucide-react'

export interface PropertyLocationCardProps {
  code: string
  location: string
  latitude: number | null
  longitude: number | null
  count: number
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

/** Read-only mini-map card — the reference's "Property Location" widget: a small
 *  muted map with a single marker and a count badge. Informational only — it
 *  intentionally doesn't link anywhere; a location preview isn't "go to this
 *  listing", and the property it's summarizing may not even be a single one. */
export default function PropertyLocationCard({ code, location, latitude, longitude, count }: PropertyLocationCardProps) {
  const hasCoords = latitude != null && longitude != null
  const mapSrc =
    hasCoords && GOOGLE_MAPS_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=14&size=600x300&scale=2&maptype=roadmap&style=feature:poi|visibility:off&markers=color:0x0a0a0a%7C${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}`
      : null

  return (
    <div className="card overflow-hidden" data-animate="fade-up">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="h-section" style={{ color: 'var(--text-1)' }}>Property Location</h2>
      </div>

      <div className="relative mt-3 h-[150px] w-full" style={{ background: 'var(--surface-3)' }}>
        {mapSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mapSrc} alt={`Map of ${location}`} className="h-full w-full object-cover grayscale" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
            <MapPin size={16} />
            {hasCoords ? 'Map preview unavailable' : 'No coordinates on file'}
          </div>
        )}
        <span
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: 'var(--ink-900)', color: '#fff' }}
        >
          {count}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{code}</p>
        <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{location}</p>
      </div>
    </div>
  )
}
