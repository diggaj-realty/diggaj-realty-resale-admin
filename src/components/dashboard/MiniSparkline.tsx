/** Tiny decorative bar sparkline — pure SVG, no client JS, safe inside server components. */
export default function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null

  const w = 64
  const h = 28
  const gap = 3
  const max = Math.max(...data, 1)
  const barW = (w - gap * (data.length - 1)) / data.length

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * h)
        const x = i * (barW + gap)
        const y = h - barH
        const opacity = 0.35 + 0.65 * (data.length === 1 ? 1 : i / (data.length - 1))
        return <rect key={i} x={x} y={y} width={barW} height={barH} rx={2} fill={color} opacity={opacity} />
      })}
    </svg>
  )
}
