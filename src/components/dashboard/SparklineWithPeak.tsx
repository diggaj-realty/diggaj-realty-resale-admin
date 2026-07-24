/** Upward sparkline (area + line) with a callout label at its peak point — pure SVG, server-safe. */
export default function SparklineWithPeak({
  data,
  labels,
  color = 'var(--accent-500)',
}: {
  data: number[]
  labels?: string[]
  color?: string
}) {
  if (!data || data.length === 0) return null

  const w = 220
  const h = 72
  const padTop = 20
  const max = Math.max(...data, 1)
  const n = data.length
  const stepX = n > 1 ? w / (n - 1) : 0

  const points = data.map((v, i) => {
    const x = n > 1 ? i * stepX : w / 2
    const y = padTop + (h - padTop) * (1 - v / max)
    return { x, y, v }
  })

  const peakIndex = data.indexOf(max)
  const peak = points[peakIndex]
  const peakLabel = labels?.[peakIndex]

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="sparkline-peak-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkline-peak-fill)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={peak.x} cy={peak.y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      <g transform={`translate(${Math.min(Math.max(peak.x, 14), w - 14)}, ${Math.max(peak.y - 10, 10)})`}>
        <text textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text-1)">
          {peak.v}
          {peakLabel ? ` ${peakLabel}` : ''}
        </text>
      </g>
    </svg>
  )
}
