import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import NegotiationRow from '@/components/dashboard/NegotiationRow'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'
import OfferTimeline from '@/components/dashboard/OfferTimeline'
import CloseNegotiationButton from '@/components/dashboard/CloseNegotiationButton'
import ActiveNegotiationRow from '@/components/dashboard/ActiveNegotiationRow'
import AgentNegotiationsView from './agent-view'
import { currentOfferTurn } from '@/lib/data/offerAcceptance'
import { formatINR, formatRelativeTime } from '@/lib/format'

const OFFER_INCLUDE = {
  property: { select: { id: true, title: true, location: true, agentId: true } },
  buyer: { select: { name: true, email: true, phone: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
}

export default async function NegotiationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Two different jobs share this route. Backend triages buyer offers on the
  // seller's side of the table; an agent runs the negotiations they're personally
  // carrying between a specific buyer and seller. Same word, different work — so
  // agents get their own view rather than a filtered version of backend's.
  if (session.user.role === 'AGENT') {
    return <AgentNegotiationsView agentId={session.user.id} />
  }
  if (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN') redirect('/dashboard')

  const [pending, active, recent] = await Promise.all([
    prisma.offer.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
      include: OFFER_INCLUDE,
    }),
    // Live negotiations past triage. These need their own section because
    // countering at triage bypasses the seller entirely — so backend is the only
    // party on that side of the table, and a buyer's counter-back would
    // otherwise sit here with nobody able to answer it.
    prisma.offer.findMany({
      where: { status: { in: ['PENDING', 'COUNTERED'] } },
      orderBy: { updatedAt: 'desc' },
      include: OFFER_INCLUDE,
    }),
    prisma.offer.findMany({
      where: { status: { in: ['ACCEPTED', 'REJECTED', 'NEGOTIATION_CLOSED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: OFFER_INCLUDE,
    }),
  ])

  const ourMove = active.filter((o) => currentOfferTurn(o) === 'SELLER').length

  return (
    <DashboardEntrance>
      <PageHeader
        title="Negotiations"
        subtitle={`${pending.length} awaiting triage · ${active.length} live${ourMove > 0 ? ` · ${ourMove} need your response` : ''}`}
      />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {pending.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>All caught up — no offers waiting for review.</p>
        ) : (
          pending.map((o) => (
            <NegotiationRow
              key={o.id}
              offerId={o.id}
              propertyId={o.property.id}
              propertyTitle={o.property.title}
              location={o.property.location}
              buyerName={o.buyer.name}
              buyerEmail={o.buyer.email}
              buyerPhone={o.buyer.phone}
              amount={o.amount}
              message={o.message}
              events={o.events}
              createdAt={o.createdAt}
            />
          ))
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Live negotiations
          {ourMove > 0 && (
            <span
              className="ml-2 rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}
            >
              {ourMove} need a response
            </span>
          )}
        </h2>
        <div className="flex flex-col gap-2.5" data-animate="fade-up">
          {active.length === 0 ? (
            <p className="card py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No negotiations in flight.
            </p>
          ) : (
            active.map((o) => (
              <ActiveNegotiationRow
                key={o.id}
                offerId={o.id}
                propertyId={o.property.id}
                propertyTitle={o.property.title}
                location={o.property.location}
                buyerName={o.buyer.name}
                amount={o.amount}
                counterAmount={o.counterAmount}
                counterBy={o.counterBy}
                status={o.status}
                currentAmount={o.counterAmount ?? o.amount}
                ourTurn={currentOfferTurn(o) === 'SELLER'}
                updatedAt={o.updatedAt}
                events={o.events}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Closed negotiations</h2>
        <div className="flex flex-col gap-2.5" data-animate="fade-up">
          {recent.length === 0 ? (
            <p className="card py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No negotiation activity yet.</p>
          ) : (
            recent.map((o) => (
              <details key={o.id} className="card px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
                <summary className="flex cursor-pointer list-none items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/listings/${o.property.id}`} className="truncate text-sm font-semibold hover:underline" style={{ color: 'var(--text-1)' }}>
                      {o.property.title}
                    </Link>
                    <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{o.property.location} · Buyer: {o.buyer.name}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(o.amount)}</span>
                  <OfferStatusPill status={o.status} />
                  <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(o.updatedAt)}</span>
                  {(o.status === 'PENDING' || o.status === 'COUNTERED') && <CloseNegotiationButton offerId={o.id} />}
                </summary>
                <div className="mt-3 pl-0.5">
                  <OfferTimeline events={o.events} />
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </DashboardEntrance>
  )
}
