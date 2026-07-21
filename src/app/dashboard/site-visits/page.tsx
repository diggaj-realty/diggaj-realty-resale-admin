import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { MapPin, CalendarClock } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleSiteVisit, completeSiteVisit, cancelSiteVisit } from '@/lib/actions/siteVisits'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'

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

export default async function SiteVisitsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const role = session.user.role
  if (role !== 'BUYER' && role !== 'AGENT') redirect('/dashboard')

  const visits = await prisma.siteVisit.findMany({
    where: role === 'BUYER' ? { buyerId: session.user.id } : { agentId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
    },
  })

  return (
    <DashboardEntrance>
      <PageHeader
        title="Site Visits"
        subtitle={role === 'BUYER' ? `${visits.length} requested` : `${visits.length} assigned`}
      />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {visits.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            {role === 'BUYER'
              ? 'No site visits yet. Request one from any property on Browse.'
              : 'No site visits assigned to you yet.'}
          </p>
        ) : (
          visits.map((v) => {
            const active = v.status === 'REQUESTED' || v.status === 'SCHEDULED'
            return (
              <div key={v.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{v.property.title}</p>
                      <VisitBadge status={v.status} />
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                      <MapPin size={11} /> {v.property.location}
                    </p>
                    {role === 'AGENT' && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>Buyer: {v.buyer.name}</p>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                      <CalendarClock size={12} /> Requested: {fmt(v.requestedDate)}
                      {v.scheduledDate && <> · Scheduled: {fmt(v.scheduledDate)}</>}
                    </p>
                    {v.buyerNote && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Note: {v.buyerNote}</p>}
                    {v.feedback && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Feedback: {v.feedback}</p>}
                  </div>
                </div>

                {/* Agent actions */}
                {role === 'AGENT' && active && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    {v.status === 'REQUESTED' && (
                      <form action={scheduleSiteVisit} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <input
                          type="datetime-local"
                          name="scheduledDate"
                          required
                          className="rounded-lg border px-2.5 py-2 text-xs outline-none"
                          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
                        />
                        <button type="submit" className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold">Schedule</button>
                      </form>
                    )}
                    {v.status === 'SCHEDULED' && (
                      <form action={completeSiteVisit} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <input
                          type="text"
                          name="feedback"
                          placeholder="Post-visit feedback (optional)"
                          className="rounded-lg border px-2.5 py-2 text-xs outline-none"
                          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
                        />
                        <button type="submit" className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold">Mark complete</button>
                      </form>
                    )}
                    <form action={cancelSiteVisit}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--line)', color: '#e11d48' }}>
                        Cancel
                      </button>
                    </form>
                  </div>
                )}

                {/* Buyer actions */}
                {role === 'BUYER' && active && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    <form action={cancelSiteVisit}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--line)', color: '#e11d48' }}>
                        Cancel request
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </DashboardEntrance>
  )
}
