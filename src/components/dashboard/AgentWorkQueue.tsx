import Link from 'next/link'
import { Phone, CalendarClock, AlertTriangle, HandGrab, CheckCircle2 } from 'lucide-react'
import { telHref, formatPhone } from '@/lib/phone'
import type { AgentWorkQueue as Queue, WorkItem } from '@/lib/data/agentWorkQueue'

/** The agent's day, at the top of their dashboard.
 *
 *  Replaces four stat tiles reading zero and a Quick Actions grid that repeated
 *  the sidebar. Every row is a person to contact, with the number to call them on,
 *  because that is the job — not "how am I doing", which nobody had asked. */
export default function AgentWorkQueue({ queue }: { queue: Queue }) {
  if (queue.isClear) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--green-700)' }}>
          <CheckCircle2 size={16} /> Nothing overdue — no visits today, and every lead has been touched.
        </p>
        {queue.claimable > 0 && (
          <Link
            href="/dashboard/leads?owner=unassigned"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
          >
            <HandGrab size={13} /> {queue.claimable} lead{queue.claimable === 1 ? '' : 's'} up for grabs
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Visits"
        icon={<CalendarClock size={15} />}
        items={queue.visitsToday}
        empty="No visits booked in the next few days."
      />
      <Section
        title="Needs a call"
        icon={<AlertTriangle size={15} />}
        items={queue.overdueLeads}
        empty="Every lead has been contacted."
      />
      <Section
        title="Blocked"
        icon={<AlertTriangle size={15} />}
        items={queue.blockedDeals}
        empty="No deal is waiting on you."
        note="These cannot move forward until the buyer's objection is answered."
      />

      {queue.claimable > 0 && (
        <Link
          href="/dashboard/leads?owner=unassigned"
          className="card flex items-center gap-2 p-4 text-xs font-semibold"
          style={{ color: 'var(--accent-700)' }}
        >
          <HandGrab size={14} /> {queue.claimable} unassigned lead{queue.claimable === 1 ? '' : 's'} available to claim →
        </Link>
      )}
    </div>
  )
}

function Section({
  title,
  icon,
  items,
  empty,
  note,
}: {
  title: string
  icon: React.ReactNode
  items: WorkItem[]
  empty: string
  note?: string
}) {
  // Sections with nothing in them are dropped rather than shown empty: a to-do
  // list padded with reassurance is harder to read than a short one.
  if (items.length === 0) return null

  return (
    <section className="card p-5">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        {icon} {title}
        <span className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
          {items.length}
        </span>
      </h3>
      {note && <p className="mb-2 text-xs" style={{ color: 'var(--text-3)' }}>{note}</p>}
      <span className="sr-only">{empty}</span>

      <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--line)' }}>
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: item.urgency === 'NOW' ? 'var(--red-500)' : 'var(--amber-500)' }}
              aria-label={item.urgency === 'NOW' ? 'Today' : 'Soon'}
            />
            <Link href={item.href} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {item.who}
                <span className="font-normal" style={{ color: 'var(--text-3)' }}> · {item.what}</span>
              </p>
              <p className="text-xs" style={{ color: item.urgency === 'NOW' ? 'var(--red-700)' : 'var(--text-3)' }}>
                {item.reason}
              </p>
            </Link>
            {/* The number, right here. Working a queue means calling people, and
                making that a two-click detour through the detail page is why
                queues go stale. */}
            {telHref(item.phone) && (
              <a
                href={telHref(item.phone)!}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
              >
                <Phone size={12} /> {formatPhone(item.phone)}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
