import { MapPin } from 'lucide-react'
import StatusPill from './StatusPill'

export interface HeroPinTag {
  label: string
  top: string
  left: string
}

export interface DashboardHeroBannerProps {
  eyebrow: string
  title: string
  count: number
  photoUrl: string | null
  pinTags?: HeroPinTag[]
  /** Property status (LIVE/DRAFT/PENDING_VERIFICATION/...) — shown as a pill next
   *  to the title whenever it's anything other than LIVE, so a featured listing
   *  that hasn't been approved yet is never mistaken for one that has. */
  status?: string
}

/** Full-width hero photo banner — title + count badge sit inline top-left directly
 *  on the (mostly un-scrimmed) photo, with a couple of small floating location pin
 *  tags scattered on the image, matching the reference's airy, bright hero. */
export default function DashboardHeroBanner({ eyebrow, title, count, photoUrl, pinTags, status }: DashboardHeroBannerProps) {
  return (
    <div
      className="card relative mb-6 h-[300px] overflow-hidden sm:h-[340px]"
      style={{ boxShadow: 'var(--elev-2)' }}
      data-animate="fade-up"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={title} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'var(--accent-gradient)' }} />
      )}

      {/* Faint bottom vignette only — just enough for legibility, not a heavy scrim */}
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.28) 100%)' }}
      />

      {pinTags?.map((pin, i) => (
        <span
          key={i}
          className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur"
          style={{ top: pin.top, left: pin.left, background: 'rgba(255,255,255,0.92)', color: 'var(--ink-900)' }}
        >
          <MapPin size={11} />
          {pin.label}
        </span>
      ))}

      <div className="absolute left-5 top-5 flex items-center gap-2.5 sm:left-6 sm:top-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{eyebrow}</p>
          <h1 className="mt-0.5 max-w-[min(90vw,560px)] text-xl font-medium leading-tight sm:text-2xl" style={{ color: 'var(--ink-900)', letterSpacing: '-0.3px' }}>
            {title}
          </h1>
        </div>
        <span
          className="flex h-7 items-center rounded-full px-2.5 text-[11px] font-bold"
          style={{ background: 'var(--ink-900)', color: '#fff' }}
        >
          {count}
        </span>
        {status && status !== 'LIVE' && <StatusPill status={status} />}
      </div>
    </div>
  )
}
