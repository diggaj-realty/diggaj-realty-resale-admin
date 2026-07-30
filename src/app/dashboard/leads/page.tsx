import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import LeadBreachBadge from '@/components/dashboard/LeadBreachBadge'
import ClaimLeadButton from '@/components/dashboard/ClaimLeadButton'
import { UserRound, MapPin, UserCog, CalendarCheck, Scale } from 'lucide-react'
import type { Prisma } from '@prisma/client'

/** Buyer leads — the operational queue for genuine interest, before any offer
 *  exists. This is the front of the funnel: someone asked to be contacted or to
 *  see a property, and somebody has to pick that up. Deliberately separate from
 *  Offers, because interest is not an offer. */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; owner?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user
  if (!['AGENT', 'BACKEND', 'ADMIN'].includes(role)) redirect('/dashboard')

  const { status, owner } = await searchParams
  const isStaff = role === 'BACKEND' || role === 'ADMIN'

  const where: Prisma.PropertyInterestWhereInput = {}
  // An agent sees their own book, and — when they ask for it — the unassigned
  // pool, so they can pick up work rather than waiting to be handed it.
  if (!isStaff) where.agentId = owner === 'unassigned' ? null : id
  else if (owner === 'unassigned') where.agentId = null
  if (status) where.status = status

  const [leads, unassignedCount, agents] = await Promise.all([
    prisma.propertyInterest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        property: { select: { id: true, title: true, location: true, askingPrice: true, status: true } },
        buyer: { select: { name: true, email: true, phone: true } },
        agent: { select: { name: true } },
        siteVisits: { select: { id: true, status: true, outcome: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        negotiationSessions: {
          select: { id: true, status: true, proposedAmount: true, buyerConfirmed: true, sellerConfirmed: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.propertyInterest.count({ where: { agentId: null } }),
    isStaff
      ? prisma.user.findMany({ where: { role: 'AGENT', isActive: true }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])

  return (
    <DashboardEntrance>
      <PageHeader
        title={isStaff ? 'Buyer Leads' : 'My Leads'}
        subtitle={`${leads.length} lead${leads.length === 1 ? '' : 's'}${
          unassignedCount > 0 ? ` · ${unassignedCount} awaiting an agent` : ''
        }`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" data-animate="fade-up">
        <FilterChip href="/dashboard/leads" label="All" active={!status && !owner} />
        <FilterChip
          href="/dashboard/leads?owner=unassigned"
          label={`${isStaff ? 'Needs an agent' : 'Up for grabs'}${unassignedCount > 0 ? ` (${unassignedCount})` : ''}`}
          active={owner === 'unassigned'}
          tone={unassignedCount > 0 ? 'warn' : undefined}
        />
        {['CONTACT_REQUESTED', 'SITE_VISIT_REQUESTED', 'SITE_VISIT_COMPLETED', 'INTERESTED', 'NEGOTIATION_IN_PROGRESS'].map(
          (s) => (
            <FilterChip
              key={s}
              href={`/dashboard/leads?status=${s}`}
              label={s.replace(/_/g, ' ').toLowerCase()}
              active={status === s}
            />
          )
        )}
      </div>

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {leads.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No leads here. When a buyer asks to be contacted or requests a visit, it appears in this queue.
          </p>
        ) : (
          leads.map((lead) => {
            const visit = lead.siteVisits[0]
            const negotiation = lead.negotiationSessions[0]
            return (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${lead.id}`}
                className="card px-5 py-4 transition-opacity hover:opacity-90"
                style={{ boxShadow: 'var(--elev-1)' }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                  >
                    <UserRound size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                      {lead.buyer.name}
                      <span className="font-normal" style={{ color: 'var(--text-3)' }}>
                        {' '}
                        · {lead.property.title}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
                      <MapPin size={11} className="flex-shrink-0" /> {lead.property.location}
                      {/* Legacy leads only: new ones can't be created without a
                          number. Flagged in the list so staff can chase it
                          without opening every lead to find out. */}
                      {!lead.buyer.phone && (
                        <span className="ml-1 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                          no phone
                        </span>
                      )}
                    </p>
                  </div>

                  <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
                    {formatINR(lead.property.askingPrice)}
                  </span>
                  <LeadBreachBadge lead={lead} />
                  <StatusPill status={lead.status} />
                  {role === 'AGENT' && !lead.agentId && <ClaimLeadButton interestId={lead.id} />}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                  <Chip
                    icon={UserCog}
                    text={lead.agent ? `Agent: ${lead.agent.name}` : 'No agent assigned'}
                    tone={lead.agent ? undefined : 'warn'}
                  />
                  {lead.source && <Chip icon={UserRound} text={lead.source.replace(/_/g, ' ').toLowerCase()} />}
                  {visit && (
                    <Chip
                      icon={CalendarCheck}
                      text={`Visit: ${visit.status.toLowerCase()}${visit.outcome ? ` · ${visit.outcome.replace(/_/g, ' ').toLowerCase()}` : ''}`}
                    />
                  )}
                  {negotiation && (
                    <Chip
                      icon={Scale}
                      text={
                        negotiation.proposedAmount != null
                          ? `Negotiating: ${formatINR(negotiation.proposedAmount)} (${
                              negotiation.buyerConfirmed ? 'buyer ✓' : 'buyer –'
                            } ${negotiation.sellerConfirmed ? 'seller ✓' : 'seller –'})`
                          : `Negotiation ${negotiation.status.toLowerCase()}`
                      }
                      tone={negotiation.buyerConfirmed && negotiation.sellerConfirmed ? 'good' : undefined}
                    />
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>

      {isStaff && agents.length === 0 && (
        <p className="mt-4 text-xs" style={{ color: 'var(--amber-700)' }}>
          No active agents exist yet — leads can&apos;t be assigned until at least one is created.
        </p>
      )}
    </DashboardEntrance>
  )
}

function FilterChip({
  href,
  label,
  active,
  tone,
}: {
  href: string
  label: string
  active?: boolean
  tone?: 'warn'
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-opacity hover:opacity-80"
      style={
        active
          ? { background: 'var(--accent-700)', color: 'white' }
          : tone === 'warn'
            ? { background: 'var(--amber-50)', color: 'var(--amber-700)' }
            : { background: 'var(--surface-2)', color: 'var(--text-2)' }
      }
    >
      {label}
    </Link>
  )
}

function Chip({
  icon: Icon,
  text,
  tone,
}: {
  icon: typeof UserRound
  text: string
  tone?: 'warn' | 'good'
}) {
  const style =
    tone === 'warn'
      ? { background: 'var(--amber-50)', color: 'var(--amber-700)' }
      : tone === 'good'
        ? { background: 'var(--green-50)', color: 'var(--green-700)' }
        : { background: 'var(--surface-2)', color: 'var(--text-2)' }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
      style={style}
    >
      <Icon size={11} /> {text}
    </span>
  )
}
