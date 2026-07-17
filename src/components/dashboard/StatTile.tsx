import type { StatMetric } from '@/lib/data/dashboard'

const TONE: Record<StatMetric['tone'], { bg: string; text: string }> = {
  green: { bg: 'var(--green-50)', text: 'var(--green-700)' },
  gold: { bg: 'var(--amber-50)', text: 'var(--amber-700)' },
  purple: { bg: 'var(--purple-50)', text: 'var(--purple-700)' },
  blue: { bg: 'var(--blue-50)', text: 'var(--blue-700)' },
  red: { bg: 'var(--red-50)', text: 'var(--red-700)' },
}

export default function StatTile({ stat }: { stat: StatMetric }) {
  const tone = TONE[stat.tone]
  return (
    <div className="card card-hover p-5" data-animate="fade-up">
      <p className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-1)' }}>{stat.value}</p>
      <p className="mt-1 text-xs font-medium" style={{ color: 'var(--text-3)' }}>{stat.label}</p>
      <p className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: tone.bg, color: tone.text }}>
        {stat.hint}
      </p>
    </div>
  )
}
