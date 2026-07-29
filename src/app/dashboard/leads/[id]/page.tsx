import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR, formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import NegotiationPanel from '@/components/dashboard/NegotiationPanel'
import AssignLeadAgentForm from '@/components/dashboard/AssignLeadAgentForm'
import LeadStatusForm from '@/components/dashboard/LeadStatusForm'
import CloseLeadForm from '@/components/dashboard/CloseLeadForm'
import { LEAD_LOSS_LABELS, type LeadLossReason } from '@/lib/visitOutcomes'
import ProposeSiteVisitForm from '@/components/dashboard/ProposeSiteVisitForm'
import SiteVisitScheduler from '@/components/dashboard/SiteVisitScheduler'
import { formatPhone, telHref, whatsAppHref } from '@/lib/phone'
import { ArrowLeft, Building2, UserRound, CalendarCheck, Phone, MessageCircle } from 'lucide-react'

/** One buyer lead, end to end: who wants what, who owns it, the visit, and the
 *  negotiation. This is where an agent works a lead from first contact through to
 *  a deal being opened. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id: userId, role } = session.user
  if (!['AGENT', 'BACKEND', 'ADMIN'].includes(role)) redirect('/dashboard')

  const { id } = await params

  const lead = await prisma.propertyInterest.findUnique({
    where: { id },
    include: {
      property: {
        select: { id: true, title: true, location: true, askingPrice: true, status: true, plan: true, sellerId: true },
      },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true, email: true, phone: true } },
      siteVisits: { orderBy: { createdAt: 'desc' } },
      negotiationSessions: {
        orderBy: { createdAt: 'desc' },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      },
    },
  })
  if (!lead) notFound()

  const isStaff = role === 'BACKEND' || role === 'ADMIN'
  const isOwnAgent = lead.agentId === userId
  // An agent who isn't on this lead has no business reading the buyer's contact
  // details, so this is a hard 404 rather than a read-only view.
  if (!isStaff && !isOwnAgent) notFound()
  const canManage = isStaff || isOwnAgent
  // One live visit at a time — two open invitations for the same buyer and
  // property would just confuse which slot is real.
  const hasOpenVisit = lead.siteVisits.some((v) => v.status === 'REQUESTED' || v.status === 'SCHEDULED')

  const seller = await prisma.user.findUnique({
    where: { id: lead.property.sellerId },
    select: { name: true },
  })

  const agents = isStaff
    ? await prisma.user.findMany({
        where: { role: 'AGENT', isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  // This buyer's other live leads.
  //
  // PropertyInterest is unique per (property, buyer) and each row carries its own
  // agent, so one buyer can be worked by several agents at once — all ringing the
  // same person about different flats, none aware of the others. Auto-assignment
  // now routes a buyer's new leads to whoever already has them, but leads
  // predating that, and staff reassignments, can still split a buyer. Showing the
  // rest of their book is what makes a collision visible.
  const otherLeads = await prisma.propertyInterest.findMany({
    where: {
      buyerId: lead.buyerId,
      id: { not: lead.id },
      status: { notIn: ['CONVERTED_TO_DEAL', 'CLOSED', 'CANCELLED', 'NOT_INTERESTED'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: 6,
    include: { property: { select: { title: true } }, agent: { select: { id: true, name: true } } },
  })

  const negotiation = lead.negotiationSessions[0] ?? null
  const dealId = lead.negotiationSessions.find((n) => n.dealId)?.dealId ?? null

  return (
    <DashboardEntrance>
      <Link
        href="/dashboard/leads"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color: 'var(--accent-700)' }}
      >
        <ArrowLeft size={13} /> Back to leads
      </Link>

      <PageHeader
        title={`${lead.buyer.name} · ${lead.property.title}`}
        subtitle={`${lead.property.location} · created ${formatRelativeTime(lead.createdAt)}`}
      />

      <div className="card mb-6 p-6" data-animate="fade-up">
        <div className="flex flex-wrap items-center gap-4">
          <StatusPill status={lead.status} />
          {lead.source && (
            <span className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>
              via {lead.source.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className="ml-auto text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
            {formatINR(lead.property.askingPrice)} asking
          </span>
        </div>
        {lead.buyerNote && (
          <p className="mt-3 rounded-lg p-3 text-sm italic" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            &ldquo;{lead.buyerNote}&rdquo;
          </p>
        )}
        {dealId && (
          <Link
            href={`/dashboard/accepted-offers/${dealId}`}
            className="mt-3 inline-block text-xs font-semibold"
            style={{ color: 'var(--accent-700)' }}
          >
            This lead became a deal — open it →
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Buyer & ownership ── */}
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <UserRound size={15} /> Buyer & ownership
          </h3>
          <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Buyer</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{lead.buyer.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>{lead.buyer.email}</p>
            {/* Tap-to-call and WhatsApp rather than a number to copy by hand:
                working a lead *is* phoning the buyer, and agents do it from
                phones. A lead with no number is flagged, not silently blank. */}
            {telHref(lead.buyer.phone) ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={telHref(lead.buyer.phone)!}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
                >
                  <Phone size={12} /> {formatPhone(lead.buyer.phone)}
                </a>
                <a
                  href={whatsAppHref(lead.buyer.phone, `Hi ${lead.buyer.name}, regarding ${lead.property.title}`)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--line)' }}
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
              </div>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                <Phone size={12} /> No phone number on file
              </p>
            )}
          </div>
          {otherLeads.length > 0 && (
            <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                This buyer&rsquo;s other open leads
              </p>
              <ul className="flex flex-col gap-1">
                {otherLeads.map((o) => {
                  // Someone else working the same buyer is the case to flag — that
                  // is two agents calling one person.
                  const collision = o.agentId != null && o.agentId !== lead.agentId
                  return (
                    <li key={o.id} className="text-xs">
                      <Link href={`/dashboard/leads/${o.id}`} style={{ color: 'var(--accent-700)' }}>
                        {o.property.title}
                      </Link>
                      <span style={{ color: 'var(--text-3)' }}> · {o.status.replace(/_/g, ' ').toLowerCase()}</span>
                      {collision && (
                        <span
                          className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}
                        >
                          with {o.agent?.name}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Assigned agent</p>
            <p className="text-sm font-semibold" style={{ color: lead.agent ? 'var(--text-1)' : 'var(--amber-700)' }}>
              {lead.agent?.name ?? 'Not assigned'}
            </p>
            {lead.agent?.email && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{lead.agent.email}</p>}
          </div>

          {isStaff && (
            <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="mb-2 text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                {lead.agentId ? 'Reassign this lead' : 'Assign an agent so someone can contact the buyer'}
              </p>
              <AssignLeadAgentForm interestId={lead.id} agentId={lead.agentId} agents={agents} />
            </div>
          )}

          {canManage && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="mb-2 text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Update status</p>
              <LeadStatusForm interestId={lead.id} status={lead.status} />
            </div>
          )}

          {/* Closing is separate from a status change: it needs a reason, and it
              is how a dead lead leaves the queue instead of sitting in it. */}
          {canManage && !lead.closedAt && lead.status !== 'CONVERTED_TO_DEAL' && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <CloseLeadForm interestId={lead.id} />
            </div>
          )}

          {lead.closedAt && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                Closed{lead.lossReason ? ` — ${LEAD_LOSS_LABELS[lead.lossReason as LeadLossReason] ?? lead.lossReason}` : ''}
              </p>
              {lead.lossNote && <p className="mt-0.5 text-xs italic" style={{ color: 'var(--text-3)' }}>&ldquo;{lead.lossNote}&rdquo;</p>}
            </div>
          )}
        </section>

        {/* ── Property ── */}
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <Building2 size={15} /> Property
          </h3>
          <dl className="flex flex-col gap-1.5 text-xs">
            <Row label="Title" value={lead.property.title} />
            <Row label="Location" value={lead.property.location} />
            <Row label="Asking price" value={formatINR(lead.property.askingPrice)} />
            <Row label="Status" value={lead.property.status} />
            <Row label="Plan" value={lead.property.plan} />
            <Row label="Seller" value={seller?.name ?? '—'} />
          </dl>
          <Link
            href={`/dashboard/listings/${lead.property.id}`}
            className="mt-3 inline-block text-xs font-semibold"
            style={{ color: 'var(--accent-700)' }}
          >
            Open full listing →
          </Link>
        </section>
      </div>

      {/* ── Site visits ── */}
      <div className="mt-6">
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <CalendarCheck size={15} /> Site visits
          </h3>
          {lead.siteVisits.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              No visits requested on this lead yet.{' '}
              <Link href="/dashboard/site-visits-queue" className="font-semibold" style={{ color: 'var(--accent-700)' }}>
                Open the visit queue →
              </Link>
            </p>
          ) : null}

          {/* The agent working this lead can open a visit themselves rather than
              waiting for the buyer to ask. Backend and admin can too — they run the
              desk, and an agent on leave used to stall every visit they owned. The
              actions enforce the same rule, so the UI offers exactly what they allow. */}
          {canManage && (
            <div className={lead.siteVisits.length === 0 ? 'mt-3' : 'mt-4 border-t pt-4'} style={{ borderColor: 'var(--line)' }}>
              <ProposeSiteVisitForm
                interestId={lead.id}
                buyerName={lead.buyer.name}
                disabledReason={
                  hasOpenVisit
                    ? 'A visit is already in progress on this lead.'
                    : lead.property.status !== 'LIVE'
                      ? 'This property is no longer available to visit.'
                      : null
                }
              />
            </div>
          )}

          {lead.siteVisits.length > 0 && (
            <ul className="flex flex-col gap-2">
              {lead.siteVisits.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                  <StatusPill status={v.status} />
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Requested {v.requestedDate.toLocaleDateString('en-IN')}
                    {v.scheduledDate ? ` · scheduled ${v.scheduledDate.toLocaleDateString('en-IN')}` : ''}
                  </span>
                  {v.outcome && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
                      style={
                        v.outcome === 'INTERESTED'
                          ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                          : v.outcome === 'NOT_INTERESTED'
                            ? { background: 'var(--red-50)', color: 'var(--red-700)' }
                            : { background: 'var(--amber-50)', color: 'var(--amber-700)' }
                      }
                    >
                      {v.outcome.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  )}
                  {v.interestedAmount != null && (
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>
                      {formatINR(v.interestedAmount)}
                    </span>
                  )}
                  {v.feedback && (
                    <span className="w-full text-xs italic" style={{ color: 'var(--text-3)' }}>{v.feedback}</span>
                  )}
                  {v.proposedDate && v.proposedBy && (
                    <span className="w-full text-xs font-semibold" style={{ color: 'var(--blue-700)' }}>
                      {v.proposedBy === 'BUYER' ? 'Buyer proposed' : 'We proposed'}{' '}
                      {v.proposedDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                  <div className="w-full">
                    <SiteVisitScheduler
                      visitId={v.id}
                      status={v.status}
                      scheduledDate={v.scheduledDate?.toISOString() ?? null}
                      requestedDate={v.requestedDate.toISOString()}
                      proposedDate={v.proposedDate?.toISOString() ?? null}
                      proposedBy={v.proposedBy}
                      canAct={canManage}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Negotiation ── */}
      <div className="mt-6">
        <NegotiationPanel
          interestId={lead.id}
          canManage={canManage}
          buyerName={lead.buyer.name}
          sellerName={seller?.name ?? 'Seller'}
          askingPrice={lead.property.askingPrice}
          negotiation={
            negotiation
              ? {
                  id: negotiation.id,
                  channel: negotiation.channel,
                  status: negotiation.status,
                  proposedAmount: negotiation.proposedAmount,
                  finalAgreedAmount: negotiation.finalAgreedAmount,
                  buyerConfirmed: negotiation.buyerConfirmed,
                  sellerConfirmed: negotiation.sellerConfirmed,
                  dealId: negotiation.dealId,
                  events: negotiation.events.map((e) => ({
                    id: e.id,
                    actorRole: e.actorRole,
                    eventType: e.eventType,
                    amount: e.amount,
                    note: e.note,
                    createdAt: e.createdAt.toISOString(),
                  })),
                }
              : null
          }
        />
      </div>
    </DashboardEntrance>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="text-right font-medium capitalize" style={{ color: 'var(--text-1)' }}>
        {value.toLowerCase() === value ? value : value.replace(/_/g, ' ').toLowerCase()}
      </dd>
    </div>
  )
}
