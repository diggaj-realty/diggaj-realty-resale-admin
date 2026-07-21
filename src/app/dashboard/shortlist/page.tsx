import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import MakeOfferRow from '@/components/dashboard/MakeOfferRow'

export default async function ShortlistPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BUYER') redirect('/dashboard')

  const shortlists = await prisma.shortlist.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: { property: true },
  })

  const properties = shortlists.map((s) => s.property)

  return (
    <DashboardEntrance>
      <PageHeader title="Shortlist" subtitle={`${properties.length} saved`} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {properties.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No shortlisted properties yet. Tap the heart on any listing to save it here.
          </p>
        ) : (
          properties.map((p) => (
            <MakeOfferRow
              key={p.id}
              propertyId={p.id}
              title={p.title}
              location={p.location}
              askingPrice={p.askingPrice}
              detail={`${p.type}${p.bhk ? ` · ${p.bhk} BHK` : ''} · ${p.areaSqft} sqft`}
              shortlisted={true}
            />
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
