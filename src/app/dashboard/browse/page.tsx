import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import MakeOfferRow from '@/components/dashboard/MakeOfferRow'

export default async function BrowsePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BUYER') redirect('/dashboard')

  const properties = await prisma.property.findMany({
    where: { status: 'LIVE' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Browse Properties" subtitle={`${properties.length} verified & live`} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {properties.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No live listings right now.</p>
        ) : (
          properties.map((p) => (
            <MakeOfferRow key={p.id} propertyId={p.id} title={p.title} location={p.location} askingPrice={p.askingPrice} />
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
