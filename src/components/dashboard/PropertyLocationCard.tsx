import { MapPin, ExternalLink } from 'lucide-react'

export interface PropertyLocationCardProps {
  code: string
  location: string
  latitude: number | null
  longitude: number | null
  count: number
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

/** Mini-map card — the reference's "Property Location" widget: a small muted
 *  map with a single marker and a count badge. Clicking opens the real
 *  location in Google Maps (a new tab) rather than the internal listing page
 *  — a location preview is "show me this place", not "go to this listing". */
export default function PropertyLocationCard({ code, location, latitude, longitude, count }: PropertyLocationCardProps) {
  const hasCoords = latitude != null && longitude != null
  const mapSrc =
    hasCoords && GOOGLE_MAPS_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=14&size=600x300&scale=2&maptype=roadmap&style=feature:poi|visibility:off&markers=color:0x0a0a0a%7C${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}`
      : null
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null

  return (
    <div className="card overflow-hidden" data-animate="fade-up">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="h-section" style={{ color: 'var(--text-1)' }}>Property Location</h2>
      </div>

      {googleMapsUrl ? (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative mt-3 block h-[150px] w-full"
          style={{ background: 'var(--surface-3)' }}
        >
          {mapSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mapSrc} alt={`Map of ${location}`} className="h-full w-full object-cover grayscale transition-opacity group-hover:opacity-90" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
              <MapPin size={16} />
              Map preview unavailable
            </div>
          )}
          <span
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: 'var(--ink-900)', color: '#fff' }}
          >
            {count}
          </span>
          <span
            className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--ink-900)' }}
          >
            <ExternalLink size={11} /> Open in Google Maps
          </span>
        </a>
      ) : (
        <div className="relative mt-3 h-[150px] w-full" style={{ background: 'var(--surface-3)' }}>
          <div className="flex h-full flex-col items-center justify-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
            <MapPin size={16} />
            No coordinates on file
          </div>
          <span
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: 'var(--ink-900)', color: '#fff' }}
          >
            {count}
          </span>
        </div>
      )}

      <div className="px-5 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{code}</p>
        <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{location}</p>
      </div>
    </div>
  )
}
