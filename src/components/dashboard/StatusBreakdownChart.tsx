'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#7C5CFC', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#A855F7']

export default function StatusBreakdownChart({ items }: { items: { status: string }[] }) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = item.status.replace(/_/g, ' ')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
  const total = items.length

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No data to break down yet.</p>
  }

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: 170, height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={3} startAngle={90} endAngle={-270}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold" style={{ color: 'var(--text-1)' }}>{total}</span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Total</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate capitalize" style={{ color: 'var(--text-2)' }}>{d.name.toLowerCase()}</span>
            <span className="font-bold" style={{ color: 'var(--text-1)' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
