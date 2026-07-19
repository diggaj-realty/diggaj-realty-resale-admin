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
import { formatINR, formatRelativeTime } from '@/lib/format'

const OFFER_INCLUDE = {
  property: { select: { id: true, title: true, location: true, agentId: true } },
  buyer: { select: { name: true, email: true, phone: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
}

export default async function NegotiationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const [pending, recent] = await Promise.all([
    prisma.offer.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
      include: OFFER_INCLUDE,
    }),
    prisma.offer.findMany({
      where: { status: { not: 'PENDING_REVIEW' } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: OFFER_INCLUDE,
    }),
  ])

  return (
    <DashboardEntrance>
      <PageHeader title="Negotiations" subtitle={`${pending.length} offer${pending.length === 1 ? '' : 's'} awaiting triage`} />

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
            />
          ))
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Recent negotiations</h2>
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
