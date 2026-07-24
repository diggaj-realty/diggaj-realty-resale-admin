import { Gauge } from 'lucide-react'

const TONE_STYLES = {
  green: { background: 'var(--green-50)', color: 'var(--green-700)' },
  amber: { background: 'var(--amber-50)', color: 'var(--amber-700)' },
  red: { background: 'var(--red-50)', color: 'var(--red-700)' },
} as const

/** Listing quality/completeness chip — nudges fuller listings, helps staff
 *  triage weak ones at a glance (99acres/MagicBricks inventory-manager pattern). */
export default function CompletenessBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={TONE_STYLES[tone]}
      title="Listing completeness score"
    >
      <Gauge size={11} /> {score}% complete
    </span>
  )
}
