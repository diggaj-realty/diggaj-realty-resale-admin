import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import { Briefcase } from 'lucide-react'

export default async function DealsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  if (!['SELLER', 'BUYER', 'AGENT'].includes(role)) redirect('/dashboard')

  const where = role === 'SELLER' ? { sellerId: id } : role === 'BUYER' ? { buyerId: id } : { agentId: id }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
    },
  })

  const title = role === 'BUYER' ? 'My Deals' : role === 'SELLER' ? 'My Deals' : 'Assigned Deals'

  return (
    <DashboardEntrance>
      <PageHeader title={title} subtitle={`${deals.length} deal${deals.length === 1 ? '' : 's'}`} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {deals.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No deals yet.</p>
        ) : (
          deals.map((d) => (
            <div key={d.id} className="card flex items-center gap-4 px-5 py-4" style={{ boxShadow: 'var(--elev-1)' }}>
              <span
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: d.status === 'CLOSED' ? 'var(--green-50)' : 'var(--amber-50)', color: d.status === 'CLOSED' ? 'var(--green-700)' : 'var(--amber-700)' }}
              >
                <Briefcase size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{d.property.title}</p>
                <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                  {d.property.location} · Buyer: {d.buyer.name} · Seller: {d.seller.name}
                  {d.agent ? ` · Agent: ${d.agent.name}` : ''}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(d.agreedPrice)}</span>
              <StatusPill status={d.status} />
            </div>
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
