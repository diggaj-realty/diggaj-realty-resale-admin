import StatusPill from './StatusPill'

export interface DashboardHeroBannerProps {
  eyebrow: string
  title: string
  photoUrl: string | null
  /** Property status (LIVE/DRAFT/PENDING_VERIFICATION/...) — shown as a pill next
   *  to the title whenever it's anything other than LIVE, so a featured listing
   *  that hasn't been approved yet is never mistaken for one that has. */
  status?: string
}

/** Full-width hero photo banner — eyebrow/title sit in a dark, blurred scrim card
 *  over the photo so they stay legible regardless of what's underneath. */
export default function DashboardHeroBanner({ eyebrow, title, photoUrl, status }: DashboardHeroBannerProps) {
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

      <div
        className="absolute left-5 top-5 max-w-[min(90vw,560px)] rounded-2xl px-4 py-3 backdrop-blur-sm sm:left-6 sm:top-6"
        style={{ background: 'rgba(10,10,10,0.5)' }}
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{eyebrow}</p>
          {status && status !== 'LIVE' && <StatusPill status={status} />}
        </div>
        <h1 className="mt-0.5 text-xl font-medium leading-tight text-white sm:text-2xl" style={{ letterSpacing: '-0.3px' }}>
          {title}
        </h1>
      </div>
    </div>
  )
}
