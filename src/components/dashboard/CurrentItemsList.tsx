import Link from 'next/link'
import type { PipelineItem } from '@/lib/data/dashboard'
import { statusTone } from '@/lib/data/dashboard'

const TONE_BAR: Record<string, string> = {
  green: 'var(--green-500)',
  gold: 'var(--amber-500)',
  purple: 'var(--purple-500)',
  blue: 'var(--blue-500)',
  red: 'var(--red-500)',
}
const TONE_BG: Record<string, string> = {
  green: 'var(--green-50)',
  gold: 'var(--amber-50)',
  purple: 'var(--purple-50)',
  blue: 'var(--blue-50)',
  red: 'var(--red-50)',
}
const TONE_TEXT: Record<string, string> = {
  green: 'var(--green-700)',
  gold: 'var(--amber-700)',
  purple: 'var(--purple-700)',
  blue: 'var(--blue-700)',
  red: 'var(--red-700)',
}

export default function CurrentItemsList({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: PipelineItem[]
  emptyMessage: string
}) {
  return (
    <div className="card card-hover p-6" data-animate="fade-up">
      <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>{title}</h2>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const tone = statusTone(item.status)
            const Row = (
              <div
                className="card-hover flex items-center gap-4 rounded-xl border px-4 py-3"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="h-9 w-1.5 flex-shrink-0 rounded-full" style={{ background: TONE_BAR[tone] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{item.title}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{item.subtitle}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
                  {item.amountLabel}
                </span>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: TONE_BG[tone], color: TONE_TEXT[tone] }}
                >
                  {item.status.replace(/_/g, ' ')}
                </span>
              </div>
            )
            return (
              <li key={item.id}>
                {item.href ? <Link href={item.href}>{Row}</Link> : Row}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
