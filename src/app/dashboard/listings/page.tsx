import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'

export default async function ListingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  if (!['SELLER', 'AGENT', 'ADMIN'].includes(role)) redirect('/dashboard')

  const where = role === 'SELLER' ? { sellerId: id } : role === 'AGENT' ? { agentId: id } : {}

  const properties = await prisma.property.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { seller: { select: { name: true } } },
  })

  const title = role === 'SELLER' ? 'My Properties' : role === 'AGENT' ? 'My Listings' : 'All Listings'

  return (
    <DashboardEntrance>
      <PageHeader title={title} subtitle={`${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`} />

      <div className="card overflow-hidden" data-animate="fade-up">
        {properties.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No properties found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-5 py-3">Property</th>
                  {role !== 'SELLER' && <th className="px-5 py-3">Seller</th>}
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id} className="border-t transition-colors hover:bg-black/[0.015]" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--text-1)' }}>{p.title}</td>
                    {role !== 'SELLER' && <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.seller.name}</td>}
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.location}</td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--accent-700)' }}>{formatINR(p.askingPrice)}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.type}</td>
                    <td className="px-5 py-3.5"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardEntrance>
  )
}
