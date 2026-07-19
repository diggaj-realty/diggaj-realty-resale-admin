import { formatINR, formatRelativeTime } from '@/lib/format'

export interface OfferTimelineEvent {
  id: string
  type: string
  amount: number | null
  actorRole: string | null
  createdAt: Date | string
}

const TYPE_LABELS: Record<string, string> = {
  CREATED: 'Offer submitted',
  FORWARDED: 'Forwarded to seller',
  COUNTERED_BACKEND: 'Countered by backend',
  COUNTERED_SELLER: 'Countered by seller',
  ACCEPTED: 'Offer accepted',
  REJECTED: 'Offer rejected',
  COUNTER_ACCEPTED: 'Counter accepted',
  COUNTER_REJECTED: 'Counter rejected',
}

export default function OfferTimeline({ events }: { events: OfferTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-3)' }}>No history yet.</p>
  }

  return (
    <ol className="flex flex-col gap-2 border-l pl-4" style={{ borderColor: 'var(--line)' }}>
      {events.map((event) => (
        <li key={event.id} className="relative text-xs">
          <span
            className="absolute -left-[21px] top-1 h-2 w-2 rounded-full"
            style={{ background: 'var(--accent-700)' }}
          />
          <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
            {TYPE_LABELS[event.type] ?? event.type}
          </span>
          {event.amount != null && (
            <span style={{ color: 'var(--accent-700)' }}> · {formatINR(event.amount)}</span>
          )}
          {event.actorRole && <span style={{ color: 'var(--text-3)' }}> · {event.actorRole.toLowerCase()}</span>}
          <span style={{ color: 'var(--text-3)' }}> · {formatRelativeTime(new Date(event.createdAt))}</span>
        </li>
      ))}
    </ol>
  )
}
