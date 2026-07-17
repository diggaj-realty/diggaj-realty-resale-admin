import type { StatMetric } from '@/lib/data/dashboard'
import { ROLE_LABELS } from './navConfig'
import type { UserRole } from '@/types'

const TONE_COLOR: Record<StatMetric['tone'], string> = {
  green: 'var(--green-700)',
  gold: 'var(--amber-700)',
  purple: 'var(--purple-700)',
  blue: 'var(--blue-700)',
  red: 'var(--red-700)',
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export default function ProfileSummaryCard({
  userName,
  role,
  stats,
}: {
  userName: string
  role: UserRole
  stats: StatMetric[]
}) {
  return (
    <div className="card card-hover flex flex-col justify-between p-6" data-animate="fade-up">
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))' }}
        >
          {initials(userName)}
        </span>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{userName}</p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{ROLE_LABELS[role]}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        {stats.map((s) => {
          const isPlainInt = /^\d+$/.test(s.value)
          return (
          <div key={s.label} className="min-w-[92px] flex-1">
            <p
              className="stat-count text-xl font-extrabold tracking-tight"
              style={{ color: 'var(--text-1)' }}
              {...(isPlainInt ? { 'data-count-to': s.value } : {})}
            >
              {s.value}
            </p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight" style={{ color: 'var(--text-3)' }}>{s.label}</p>
            <p className="mt-1 text-[10px] font-semibold" style={{ color: TONE_COLOR[s.tone] }}>{s.hint}</p>
          </div>
          )
        })}
      </div>
    </div>
  )
}
