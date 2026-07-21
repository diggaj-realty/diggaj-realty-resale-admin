import { Building2, Wallet, CheckCircle2, Users2, TrendingUp, Activity } from 'lucide-react'
import type { StatMetric } from '@/lib/data/dashboard'
import MiniSparkline from './MiniSparkline'

const TONE: Record<StatMetric['tone'], { bg: string; text: string; solid: string }> = {
  green: { bg: 'var(--green-50)', text: 'var(--green-700)', solid: 'var(--green-500)' },
  gold: { bg: 'var(--amber-50)', text: 'var(--amber-700)', solid: 'var(--amber-500)' },
  purple: { bg: 'var(--purple-50)', text: 'var(--purple-700)', solid: 'var(--purple-500)' },
  blue: { bg: 'var(--blue-50)', text: 'var(--blue-700)', solid: 'var(--blue-500)' },
  red: { bg: 'var(--red-50)', text: 'var(--red-700)', solid: 'var(--red-500)' },
}

const STAT_ICONS = { users: Users2, wallet: Wallet, check: CheckCircle2, building: Building2, activity: Activity } as const

function iconKeyForLabel(label: string): keyof typeof STAT_ICONS {
  const l = label.toLowerCase()
  if (l.includes('user') || l.includes('client') || l.includes('alert')) return 'users'
  if (l.includes('value') || l.includes('price') || l.includes('portfolio') || l.includes('revenue')) return 'wallet'
  if (l.includes('closed') || l.includes('sold') || l.includes('accepted') || l.includes('approved') || l.includes('rate')) return 'check'
  if (l.includes('listing') || l.includes('propert')) return 'building'
  return 'activity'
}

export default function StatTile({ stat, spark }: { stat: StatMetric; spark?: number[] }) {
  const tone = TONE[stat.tone]
  const Icon = STAT_ICONS[iconKeyForLabel(stat.label)]

  return (
    <div className="card card-hover p-5" data-animate="fade-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>{stat.value}</p>
          <p className="mt-1 truncate text-xs font-medium" style={{ color: 'var(--text-3)' }}>{stat.label}</p>
        </div>
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: tone.bg, color: tone.text }}
        >
          <Icon size={16} />
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.text }}
        >
          <TrendingUp size={10} />
          {stat.hint}
        </span>
        {spark && spark.length > 0 && <MiniSparkline data={spark} color={tone.solid} />}
      </div>
    </div>
  )
}
