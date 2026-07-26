import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR, formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import { computeDealProgress } from '@/lib/data/dealProgress'
import { FileCheck2, User2, UserCog, CalendarCheck, FileText, IndianRupee } from 'lucide-react'

/** Accepted Offers — the operational queue for everything that happens *after*
 *  an offer is accepted. A Deal row is created at acceptance, so a deal is the
 *  accepted offer for the purposes of this workflow; this page hangs the whole
 *  post-acceptance process (agent, visit, offline negotiation, docs, payments,
 *  closure) off it instead of leaving acceptance as a dead end. */
export default async function AcceptedOffersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  if (!['AGENT', 'BACKEND', 'ADMIN'].includes(role)) redirect('/dashboard')

  // Agents only ever see what they're assigned to; backend/admin see everything.
  const where = role === 'AGENT' ? { agentId: id } : {}

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { id: true, title: true, location: true, status: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
      documents: { select: { status: true } },
      offlineNegotiations: { select: { id: true } },
      paymentRequests: { select: { status: true, amount: true } },
      siteVisit: { select: { status: true, outcome: true } },
    },
  })

  const subtitle =
    role === 'AGENT'
      ? `${deals.length} assigned transaction${deals.length === 1 ? '' : 's'}`
      : `${deals.length} accepted offer${deals.length === 1 ? '' : 's'} in progress`

  return (
    <DashboardEntrance>
      <PageHeader title="Accepted Offers" subtitle={subtitle} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {deals.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No accepted offers yet. Once an offer is accepted, the transaction appears here.
          </p>
        ) : (
          deals.map((d) => {
            const progress = computeDealProgress(d)
            return (
              <Link
                key={d.id}
                href={`/dashboard/accepted-offers/${d.id}`}
                className="card px-5 py-4 transition-opacity hover:opacity-90"
                style={{ boxShadow: 'var(--elev-1)' }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: d.status === 'CLOSED' ? 'var(--green-50)' : 'var(--amber-50)',
                      color: d.status === 'CLOSED' ? 'var(--green-700)' : 'var(--amber-700)',
                    }}
                  >
                    <FileCheck2 size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                      {d.property.title}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                      {d.property.location} · Accepted {formatRelativeTime(d.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="block whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
                      {formatINR(d.agreedPrice)}
                    </span>
                    <span className="block whitespace-nowrap text-[11px]" style={{ color: 'var(--text-3)' }}>
                      agreed
                    </span>
                  </div>

                  <StatusPill status={d.status} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                  <Chip icon={User2} text={`Buyer: ${d.buyer.name}`} />
                  <Chip icon={User2} text={`Seller: ${d.seller.name}`} />
                  <Chip
                    icon={UserCog}
                    text={d.agent ? `Agent: ${d.agent.name}` : 'Agent: not assigned'}
                    tone={d.agent ? undefined : 'warn'}
                  />
                  <Chip
                    icon={CalendarCheck}
                    text={`Visit: ${d.siteVisit ? d.siteVisit.status.toLowerCase() : 'none'}${
                      d.siteVisit?.outcome ? ` (${d.siteVisit.outcome.toLowerCase().replace('_', ' ')})` : ''
                    }`}
                  />
                  <Chip
                    icon={FileText}
                    text={
                      progress.documents.total === 0
                        ? 'Docs: none requested'
                        : `Docs: ${progress.documents.approved}/${progress.documents.total} approved`
                    }
                  />
                  <Chip
                    icon={IndianRupee}
                    text={
                      progress.payments.total === 0
                        ? 'Payments: none'
                        : progress.payments.pendingAmount > 0
                          ? `Payments: ${formatINR(progress.payments.pendingAmount)} pending`
                          : `Payments: all ${progress.payments.total} paid`
                    }
                  />
                  <span
                    className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                  >
                    {progress.label}
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </DashboardEntrance>
  )
}

function Chip({
  icon: Icon,
  text,
  tone,
}: {
  icon: typeof User2
  text: string
  tone?: 'warn'
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={
        tone === 'warn'
          ? { background: 'var(--amber-50)', color: 'var(--amber-700)' }
          : { background: 'var(--surface-2)', color: 'var(--text-2)' }
      }
    >
      <Icon size={11} /> {text}
    </span>
  )
}
