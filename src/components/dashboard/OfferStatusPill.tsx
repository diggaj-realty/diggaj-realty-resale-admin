'use client'

// Client-safe status pill for offer rows. Deliberately does NOT import from
// '@/lib/data/dashboard' (which pulls in the Prisma/better-sqlite3 server module) —
// importing that into a 'use client' component tree breaks the client bundle.
const TONE_BG: Record<string, string> = {
  green: 'var(--green-50)',
  gold: 'var(--amber-50)',
  purple: 'var(--purple-50)',
  blue: 'var(--blue-50)',
  red: 'var(--red-50)',
}
const TONE_TEXT: Record<string, string> = {
  green: 'var(--green-700)',
  gold: 'var(--amber-700)',
  purple: 'var(--purple-700)',
  blue: 'var(--blue-700)',
  red: 'var(--red-700)',
}

function offerStatusTone(status: string): string {
  const s = status.toUpperCase()
  if (s === 'ACCEPTED') return 'green'
  if (s === 'PENDING' || s === 'PENDING_REVIEW') return 'gold'
  if (s === 'COUNTERED') return 'blue'
  if (s === 'REJECTED') return 'red'
  return 'purple'
}

export default function OfferStatusPill({ status }: { status: string }) {
  const tone = offerStatusTone(status)
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: TONE_BG[tone], color: TONE_TEXT[tone] }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
