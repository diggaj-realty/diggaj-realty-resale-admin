import type { InterestData } from '@/lib/data/dashboard'
import AvatarStack from './AvatarStack'
import SparklineWithPeak from './SparklineWithPeak'

/** The overview's third card — reference's "Tenant Search" progress-card pattern,
 *  mapped to real per-role data (see getRecentInterest). */
export default function TrendingInterestCard({ data }: { data: InterestData }) {
  const hasSeries = data.series.some((v) => v > 0)

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{data.title}</h2>
        <AvatarStack people={data.people} />
      </div>

      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{data.subtitle}</p>

      <div className="mt-3">
        {hasSeries ? (
          <SparklineWithPeak data={data.series} labels={data.seriesLabels} />
        ) : (
          <p className="py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>Not enough activity yet.</p>
        )}
      </div>
    </div>
  )
}
