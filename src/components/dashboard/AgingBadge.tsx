import { agingBucket } from '@/lib/format'

const TONE_STYLES: Record<'green' | 'amber' | 'red', { background: string; color: string }> = {
  green: { background: 'var(--green-50)', color: 'var(--green-700)' },
  amber: { background: 'var(--amber-50)', color: 'var(--amber-700)' },
  red: { background: 'var(--red-50)', color: 'var(--red-700)' },
}

/** SLA aging chip for review queues — "Waiting Nd", escalating color past 2/4 days. */
export default function AgingBadge({ since }: { since: Date }) {
  const { label, tone } = agingBucket(since)
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={TONE_STYLES[tone]}
    >
      {label}
    </span>
  )
}
