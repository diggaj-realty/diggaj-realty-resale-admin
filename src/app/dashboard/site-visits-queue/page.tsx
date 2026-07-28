import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { MapPin, CalendarClock, UserX } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import AgingBadge from '@/components/dashboard/AgingBadge'
import AssignSiteVisitAgentForm from '@/components/dashboard/AssignSiteVisitAgentForm'
import SiteVisitOutcomePanel from '@/components/dashboard/SiteVisitOutcomePanel'
import SiteVisitScheduler from '@/components/dashboard/SiteVisitScheduler'

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  REQUESTED: { bg: 'rgba(234,179,8,0.14)', fg: '#a16207', label: 'Requested' },
  SCHEDULED: { bg: 'rgba(59,130,246,0.14)', fg: '#1d4ed8', label: 'Scheduled' },
  COMPLETED: { bg: 'rgba(34,197,94,0.14)', fg: '#15803d', label: 'Completed' },
  CANCELLED: { bg: 'rgba(148,163,184,0.18)', fg: '#64748b', label: 'Cancelled' },
}

function VisitBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.REQUESTED
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

function fmt(d: Date | null) {
  return d ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

/** ADMIN/BACKEND-only view over every site visit — the gap this page closes:
 *  a visit requested on a property with no agent assigned at request time
 *  previously had nowhere to be seen or acted on (no agent queue could show
 *  it, and no admin/backend page existed at all). Unassigned REQUESTED visits
 *  are surfaced first so staff can assign an agent and unblock them. */
export default async function SiteVisitsQueuePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN' && session.user.role !== 'BACKEND') redirect('/dashboard')

  const [visits, agents] = await Promise.all([
    prisma.siteVisit.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { title: true, location: true, askingPrice: true } },
        buyer: { select: { name: true } },
        agent: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ where: { role: 'AGENT', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const unassigned = visits.filter((v) => !v.agentId && (v.status === 'REQUESTED' || v.status === 'SCHEDULED'))
  const rest = visits.filter((v) => v.agentId || (v.status !== 'REQUESTED' && v.status !== 'SCHEDULED'))
  const ordered = [...unassigned, ...rest]

  return (
    <DashboardEntrance>
      <PageHeader
        title="Site Visits"
        subtitle={`${visits.length} total · ${unassigned.length} unassigned`}
      />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {ordered.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No site visits have been requested yet.
          </p>
        ) : (
          ordered.map((v) => {
            const isUnassigned = !v.agentId && (v.status === 'REQUESTED' || v.status === 'SCHEDULED')
            return (
              <div
                key={v.id}
                className="card p-4"
                style={isUnassigned ? { borderColor: 'var(--amber-500)', borderWidth: 1.5 } : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{v.property.title}</p>
                      <VisitBadge status={v.status} />
                      {isUnassigned && (
                        <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                          <UserX size={11} /> No agent
                        </span>
                      )}
                      <AgingBadge since={v.createdAt} />
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                      <MapPin size={11} /> {v.property.location}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
                      Buyer: {v.buyer.name} {v.agent ? `· Agent: ${v.agent.name}` : ''}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                      <CalendarClock size={12} /> Requested: {fmt(v.requestedDate)}
                      {v.scheduledDate && <> · Scheduled: {fmt(v.scheduledDate)}</>}
                    </p>
                    {v.buyerNote && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Note: {v.buyerNote}</p>}
                    {v.feedback && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Feedback: {v.feedback}</p>}
                  </div>
                </div>

                {(v.status === 'REQUESTED' || v.status === 'SCHEDULED') && (
                  <AssignSiteVisitAgentForm visitId={v.id} agentId={v.agentId} agents={agents} />
                )}

                {/* Backend can settle a date too — otherwise an unassigned visit
                    with a buyer's proposal sitting on it has nobody to answer it. */}
                {(v.status === 'REQUESTED' || v.status === 'SCHEDULED') && (
                  <SiteVisitScheduler
                    visitId={v.id}
                    status={v.status}
                    scheduledDate={v.scheduledDate?.toISOString() ?? null}
                    requestedDate={v.requestedDate?.toISOString() ?? null}
                    proposedDate={v.proposedDate?.toISOString() ?? null}
                    proposedBy={v.proposedBy}
                    canAct
                  />
                )}

                {v.status === 'COMPLETED' && (
                  <SiteVisitOutcomePanel
                    visitId={v.id}
                    outcome={v.outcome}
                    interestedAmount={v.interestedAmount}
                    askingPrice={v.property.askingPrice}
                    dealId={v.dealId}
                    canRecordOutcome={false}
                    canCreateDeal={true}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </DashboardEntrance>
  )
}
