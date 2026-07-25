import { TrendingUp, TrendingDown } from 'lucide-react'
import type { StatMetric } from '@/lib/data/dashboard'

const TONE: Record<StatMetric['tone'], { bg: string; text: string; solid: string }> = {
  green: { bg: 'var(--green-50)', text: 'var(--green-700)', solid: 'var(--green-500)' },
  gold: { bg: 'var(--amber-50)', text: 'var(--amber-700)', solid: 'var(--amber-500)' },
  purple: { bg: 'var(--purple-50)', text: 'var(--purple-700)', solid: 'var(--purple-500)' },
  blue: { bg: 'var(--blue-50)', text: 'var(--blue-700)', solid: 'var(--blue-500)' },
  red: { bg: 'var(--red-50)', text: 'var(--red-700)', solid: 'var(--red-500)' },
}

/** Big-index-number card with a 7-day range track — same visual language as
 *  the "Occupancy Index" card in the reference (huge bold number + a
 *  min/current/max horizontal bar), but built from data we actually have:
 *  the real 7-day daily series already powering PerformanceChartCard, not a
 *  fabricated MoM/YoY percentage. "vs 7-day avg" is a genuine comparison of
 *  today's value against the average of the other six days in the window. */
export default function IndexRangeCard({ stat, series }: { stat: StatMetric; series: { label: string; value: number }[] }) {
  const tone = TONE[stat.tone]
  const values = series.map((s) => s.value)
  const hasSeries = values.length > 1

  const min = hasSeries ? Math.min(...values) : 0
  const max = hasSeries ? Math.max(...values) : 0
  const latest = hasSeries ? values[values.length - 1] : 0
  const priorAvg = hasSeries ? values.slice(0, -1).reduce((s, v) => s + v, 0) / (values.length - 1) : 0
  const delta = hasSeries && priorAvg > 0 ? Math.round(((latest - priorAvg) / priorAvg) * 100) : null
  const range = max - min
  const markerPct = range > 0 ? ((latest - min) / range) * 100 : 50

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{stat.label}</p>
        {delta !== null && (
          <span
            className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: tone.bg, color: tone.text }}
          >
            {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>

      <p className="text-5xl font-bold tracking-tight" style={{ color: 'var(--text-1)', letterSpacing: 'var(--tracking-heading)' }}>
        {stat.value}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{stat.hint}</p>

      {hasSeries && (
        <div className="mt-6">
          <div className="relative h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${markerPct}%`, background: tone.solid }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white"
              style={{ left: `${markerPct}%`, background: tone.solid, boxShadow: 'var(--elev-1)' }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
            <span>Low {min}</span>
            <span>7-day range</span>
            <span>High {max}</span>
          </div>
        </div>
      )}
    </div>
  )
}
