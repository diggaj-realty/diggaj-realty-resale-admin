import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { formatINR } from '@/lib/format'
import { formatPhone, telHref } from '@/lib/phone'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import { getPipeline } from '@/lib/data/pipeline'
import { Phone, AlertTriangle } from 'lucide-react'

/** One board for the whole funnel.
 *
 *  Leads, Site Visits, Negotiations, Accepted Offers and Deals are five pages for
 *  one process on one buyer, so staff had to know the funnel's shape to navigate it
 *  and carry the context between tabs themselves. This shows every thread at once,
 *  in the column it has reached, flagged where it is stuck.
 *
 *  The five pages remain — each does things a board cannot (assigning agents,
 *  recording outcomes, working a negotiation) and this links straight into them.
 *  It is the way in, not a replacement.
 */
export default async function PipelinePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user
  if (!['AGENT', 'BACKEND', 'ADMIN'].includes(role)) redirect('/dashboard')

  // An agent sees their own book, exactly as the five pages already scope it.
  const pipeline = await getPipeline(role === 'AGENT' ? { agentId: id } : {})

  return (
    <DashboardEntrance>
      <PageHeader
        title={role === 'AGENT' ? 'My Pipeline' : 'Pipeline'}
        subtitle={`${pipeline.total} thread${pipeline.total === 1 ? '' : 's'}${pipeline.flagged > 0 ? ` · ${pipeline.flagged} needing attention` : ''}`}
      />

      <div className="flex gap-4 overflow-x-auto pb-4" data-animate="fade-up">
        {pipeline.columns.map((column) => (
          <section key={column.key} className="flex w-[15.5rem] flex-shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                {column.label}
              </h2>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                {column.threads.length}
              </span>
            </div>

            {column.threads.length === 0 ? (
              <p className="card px-3 py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                Nothing here
              </p>
            ) : (
              column.threads.map((t) => (
                <div key={`${t.id}-${t.dealOnly}`} className="card p-3" style={{ boxShadow: 'var(--elev-1)' }}>
                  <Link href={t.href}>
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                      {t.buyerName}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--text-2)' }}>
                      {t.propertyTitle}
                    </p>
                    <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {t.propertyLocation} · {formatINR(t.askingPrice)}
                    </p>
                    <p className="mt-1 truncate text-[11px] capitalize" style={{ color: 'var(--text-3)' }}>
                      {t.detail}
                    </p>
                  </Link>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.flag && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize"
                        style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
                      >
                        <AlertTriangle size={9} /> {t.flag}
                      </span>
                    )}
                    {/* Staff need to see who owns a thread; an agent's board is all
                        their own, so the name would be noise on every card. */}
                    {role !== 'AGENT' && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                      >
                        {t.agentName ?? 'no agent'}
                      </span>
                    )}
                    {telHref(t.buyerPhone) && (
                      <a
                        href={telHref(t.buyerPhone)!}
                        className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
                      >
                        <Phone size={9} /> {formatPhone(t.buyerPhone)}
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </DashboardEntrance>
  )
}
