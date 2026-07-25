'use client'

import { useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts'

const tooltipStyle = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 8px 24px rgba(20,22,31,0.12)',
  fontSize: 12,
}

function toMonthlyBuckets(series: { label: string; value: number }[]) {
  // Roll the 7 daily points into ~2 half-week buckets to simulate a "month" zoom level.
  const first = series.slice(0, Math.ceil(series.length / 2))
  const second = series.slice(Math.ceil(series.length / 2))
  const sum = (arr: { value: number }[]) => arr.reduce((s, x) => s + x.value, 0)
  return [
    { label: 'Wk 1', value: sum(first) },
    { label: 'Wk 2', value: sum(second) },
  ]
}

/** Floating value label above the tallest bar — the reference's "$3.9m"
 *  peak-callout pattern, using our own real series values (no fabricated
 *  figures). Recharts positions each <Bar> child label via the injected
 *  x/y/width props at render time. */
function PeakLabel(props: Record<string, unknown> & { peakValue: number }) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const value = Number(props.value ?? NaN)
  if (value !== props.peakValue) return null
  return (
    <g transform={`translate(${x + width / 2}, ${y - 14})`}>
      <rect x={-20} y={-16} width={40} height={22} rx={11} fill="var(--accent-600)" />
      <text x={0} y={0} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {value}
      </text>
    </g>
  )
}

export default function PerformanceChartCard({
  title,
  series,
}: {
  title: string
  series: { label: string; value: number }[]
}) {
  const [range, setRange] = useState<'week' | 'month'>('week')
  const data = range === 'week' ? series : toMonthlyBuckets(series)
  const peakValue = Math.max(...data.map((d) => d.value), 0)

  return (
    <div className="card card-hover p-6" data-animate="fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{title}</h2>
        <div className="flex flex-shrink-0 gap-1 rounded-full p-1" style={{ background: 'var(--surface-3)' }}>
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors"
              style={{
                background: range === r ? 'var(--surface)' : 'transparent',
                color: range === r ? 'var(--text-1)' : 'var(--text-3)',
                boxShadow: range === r ? 'var(--elev-1)' : 'none',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 30, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent-50)' }} />
          <Bar dataKey="value" radius={[10, 10, 10, 10]} maxBarSize={36}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value === peakValue ? 'var(--accent-600)' : 'var(--surface-3)'} />
            ))}
            <LabelList dataKey="value" content={(props) => <PeakLabel {...props} peakValue={peakValue} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
