import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import NegotiationRow from '@/components/dashboard/NegotiationRow'

export default async function NegotiationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const offers = await prisma.offer.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'asc' },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
    },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Negotiations" subtitle={`${offers.length} offer${offers.length === 1 ? '' : 's'} awaiting triage`} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {offers.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>All caught up — no offers waiting for review.</p>
        ) : (
          offers.map((o) => (
            <NegotiationRow
              key={o.id}
              offerId={o.id}
              propertyTitle={o.property.title}
              location={o.property.location}
              buyerName={o.buyer.name}
              amount={o.amount}
              message={o.message}
            />
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
