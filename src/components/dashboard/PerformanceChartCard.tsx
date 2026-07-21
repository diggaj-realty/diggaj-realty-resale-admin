'use client'

import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'

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

export default function PerformanceChartCard({
  title,
  series,
}: {
  title: string
  series: { label: string; value: number }[]
}) {
  const [range, setRange] = useState<'week' | 'month'>('week')
  const data = range === 'week' ? series : toMonthlyBuckets(series)

  return (
    <div className="card card-hover p-6" data-animate="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{title}</h2>
        <div className="flex gap-1 rounded-full p-1" style={{ background: 'var(--surface-3)' }}>
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
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(185,138,68,0.08)' }} />
          <Bar dataKey="value" fill="var(--ink-800)" radius={[10, 10, 10, 10]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
