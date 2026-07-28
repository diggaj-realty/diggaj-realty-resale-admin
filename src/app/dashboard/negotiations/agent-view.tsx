import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatINR, formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import { Scale, Check, Clock } from 'lucide-react'

/** The negotiations an agent is personally running.
 *
 *  Agent-assisted negotiations were only reachable by digging into individual
 *  lead pages, which is no way to work a book — an agent needs to see every
 *  negotiation they're carrying and, above all, which ones are waiting on them.
 *
 *  Scoped to `agentId` rather than showing everything: these hold the buyer's and
 *  seller's positions, which aren't another agent's business.
 *
 *  Note what this deliberately does not do — it never offers to confirm on a
 *  party's behalf. Confirmation is each party's own act from their own login; an
 *  agent recording "they agreed" is a note about a conversation, not consent. */
export default async function AgentNegotiationsView({ agentId }: { agentId: string }) {
  const sessions = await prisma.negotiationSession.findMany({
    where: { agentId },
    orderBy: { updatedAt: 'desc' },
    include: {
      property: { select: { id: true, title: true, location: true, askingPrice: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 1 },
      deal: { select: { id: true } },
    },
  })

  const OPEN = ['OPEN', 'IN_PROGRESS', 'AGREEMENT_PENDING_CONFIRMATION']
  const live = sessions.filter((s) => OPEN.includes(s.status))
  const closed = sessions.filter((s) => !OPEN.includes(s.status))

  // "Waiting on you" means a price is on the table and at least one party still
  // hasn't confirmed it — the agent's job is to go and get that confirmation.
  const awaitingConfirmation = live.filter(
    (s) => s.proposedAmount != null && (!s.buyerConfirmed || !s.sellerConfirmed)
  ).length

  function Row({ s }: { s: (typeof sessions)[number] }) {
    const both = s.buyerConfirmed && s.sellerConfirmed
    return (
      <div className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/leads/${s.interestId}`}
              className="truncate text-sm font-semibold hover:underline"
              style={{ color: 'var(--text-1)' }}
            >
              {s.property.title}
            </Link>
            <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
              {s.property.location} · {s.buyer.name} ↔ {s.seller.name} · via {s.channel.replace(/_/g, ' ').toLowerCase()}
            </p>
          </div>

          <div className="text-right">
            <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
              {s.proposedAmount != null ? formatINR(s.proposedAmount) : '—'}
            </span>
            <span className="block whitespace-nowrap text-[11px]" style={{ color: 'var(--text-3)' }}>
              asking {formatINR(s.property.askingPrice)}
            </span>
          </div>

          {/* Both confirmations shown separately — a single "confirmed" flag would
              hide which side still hasn't agreed, which is the actionable bit. */}
          <div className="flex items-center gap-1.5">
            {(['buyer', 'seller'] as const).map((side) => {
              const done = side === 'buyer' ? s.buyerConfirmed : s.sellerConfirmed
              return (
                <span
                  key={side}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
                  style={
                    done
                      ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                      : { background: 'var(--amber-50)', color: 'var(--amber-700)' }
                  }
                >
                  {done ? <Check size={11} /> : <Clock size={11} />} {side}
                </span>
              )
            })}
          </div>

          <StatusPill status={s.status} />
          <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>
            {formatRelativeTime(s.updatedAt)}
          </span>

          <Link
            href={`/dashboard/leads/${s.interestId}`}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
          >
            Open lead →
          </Link>
        </div>

        {s.events[0] && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
            Last: {s.events[0].eventType.replace(/_/g, ' ').toLowerCase()}
            {s.events[0].amount != null ? ` at ${formatINR(s.events[0].amount)}` : ''} ·{' '}
            {formatRelativeTime(s.events[0].createdAt)}
          </p>
        )}

        {both && !s.deal && (
          <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--green-700)' }}>
            Both parties have confirmed — ready to create the deal from the lead page.
          </p>
        )}
        {s.deal && (
          <Link
            href={`/dashboard/deals/${s.deal.id}`}
            className="mt-2 inline-block text-xs font-semibold"
            style={{ color: 'var(--accent-700)' }}
          >
            Deal created — open it →
          </Link>
        )}
      </div>
    )
  }

  return (
    <DashboardEntrance>
      <PageHeader
        title="My Negotiations"
        subtitle={`${live.length} live${awaitingConfirmation > 0 ? ` · ${awaitingConfirmation} awaiting confirmation` : ''}`}
      />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {live.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            <Scale size={18} className="mx-auto mb-2 block" style={{ color: 'var(--text-3)' }} />
            No negotiations in flight. Start one from a lead once the buyer has seen the property.{' '}
            <Link href="/dashboard/leads" className="font-semibold" style={{ color: 'var(--accent-700)' }}>
              Open my leads →
            </Link>
          </p>
        ) : (
          live.map((s) => <Row key={s.id} s={s} />)
        )}
      </div>

      {closed.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Closed
          </h2>
          <div className="flex flex-col gap-2.5" data-animate="fade-up">
            {closed.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </DashboardEntrance>
  )
}
