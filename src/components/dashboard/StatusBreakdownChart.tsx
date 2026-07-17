'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#7C5CFC', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#A855F7']

export default function StatusBreakdownChart({ items }: { items: { status: string }[] }) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = item.status.replace(/_/g, ' ')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }))

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No data to break down yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
