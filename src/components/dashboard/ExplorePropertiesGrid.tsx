import Link from 'next/link'
import { MapPin, BedDouble, Ruler, Tag } from 'lucide-react'
import { formatINR } from '@/lib/format'
import StatusPill from './StatusPill'

export interface ExploreProperty {
  id: string
  title: string
  location: string
  askingPrice: number
  type: string
  bhk: number | null
  areaSqft: number
  status: string
  photoUrl: string | null
}

export default function ExplorePropertiesGrid({
  title,
  properties,
  viewHref,
}: {
  title: string
  properties: ExploreProperty[]
  viewHref: string
}) {
  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{title}</h2>
        <Link href={viewHref} className="text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>
          View all
        </Link>
      </div>

      {properties.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No properties to show yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {properties.map((p) => (
            <Link
              key={p.id}
              href={viewHref}
              className="card card-hover overflow-hidden"
              style={{ boxShadow: 'none', border: '1px solid var(--line)' }}
            >
              <div className="relative h-32 w-full overflow-hidden">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full" style={{ background: 'linear-gradient(135deg, var(--accent-100), var(--accent-300))' }} />
                )}
                <span
                  className="absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--accent-700)' }}
                >
                  {formatINR(p.askingPrice)}
                </span>
                <span className="absolute left-2.5 top-2.5">
                  <StatusPill status={p.status} />
                </span>
              </div>
              <div className="p-4">
                <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{p.title}</p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                  <MapPin size={11} className="flex-shrink-0" /> {p.location}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                  {p.bhk != null && (
                    <span className="flex items-center gap-1">
                      <BedDouble size={13} /> {p.bhk}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Ruler size={13} /> {p.areaSqft} sqft
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag size={13} /> {p.type}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
