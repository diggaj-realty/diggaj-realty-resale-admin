import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buyerFacingOfferStatus } from '@/lib/data/dashboard'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import SellerOfferRow from '@/components/dashboard/SellerOfferRow'
import BuyerOfferRow from '@/components/dashboard/BuyerOfferRow'

export default async function OffersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  if (role !== 'SELLER' && role !== 'BUYER' && role !== 'AGENT') redirect('/dashboard')

  if (role === 'SELLER' || role === 'AGENT') {
    // Seller/agent must never see PENDING_REVIEW rows — those don't exist for them.
    const offers = await prisma.offer.findMany({
      where: {
        property: role === 'AGENT' ? { agentId: id } : { sellerId: id },
        status: { not: 'PENDING_REVIEW' },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { title: true, location: true } },
        buyer: { select: { name: true, email: true, phone: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    })

    return (
      <DashboardEntrance>
        <PageHeader title="Offers Received" subtitle={`${offers.length} offer${offers.length === 1 ? '' : 's'}`} />
        <div className="flex flex-col gap-2.5" data-animate="fade-up">
          {offers.length === 0 ? (
            <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No offers yet.</p>
          ) : (
            offers.map((o) => (
              <SellerOfferRow
                key={o.id}
                offerId={o.id}
                propertyTitle={o.property.title}
                location={o.property.location}
                buyerName={o.buyer.name}
                buyerEmail={o.buyer.email}
                buyerPhone={o.buyer.phone}
                message={o.message}
                amount={o.amount}
                status={o.status}
                counterAmount={o.counterAmount}
                createdAt={o.createdAt}
                events={o.events}
              />
            ))
          )}
        </div>
      </DashboardEntrance>
    )
  }

  // BUYER: all their own offers, PENDING_REVIEW + PENDING collapsed to one "Pending" display.
  const offers = await prisma.offer.findMany({
    where: { buyerId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { title: true, location: true } },
    },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="My Offers" subtitle={`${offers.length} offer${offers.length === 1 ? '' : 's'}`} />
      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {offers.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No offers yet. Browse verified listings and submit your first offer.</p>
        ) : (
          offers.map((o) => (
            <BuyerOfferRow
              key={o.id}
              offerId={o.id}
              propertyTitle={o.property.title}
              location={o.property.location}
              amount={o.amount}
              displayStatus={buyerFacingOfferStatus(o.status)}
              counterAmount={o.counterAmount}
              message={o.message}
              createdAt={o.createdAt}
            />
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
