import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ReviewActions from '@/components/dashboard/ReviewActions'
import { reviewListing } from '@/lib/actions/backend'

export default async function ListingsQueuePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const queue = await prisma.property.findMany({
    where: { status: { in: ['DRAFT', 'PENDING_VERIFICATION'] } },
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { name: true, email: true, phone: true } } },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Listings Queue" subtitle={`${queue.length} awaiting verification`} />

      <div className="card overflow-hidden" data-animate="fade-up">
        {queue.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>Queue is empty — all listings verified.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-5 py-3">Property</th>
                  <th className="px-5 py-3">Seller</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{p.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{p.location}</p>
                      {p.isPublicSubmission && (
                        <span
                          className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}
                        >
                          Public link · no KYC
                        </span>
                      )}
                      {p.referralName && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Referred by: {p.referralName}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>
                      <p>{p.seller.name}</p>
                      {p.seller.phone && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{p.seller.phone}</p>}
                    </td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--accent-700)' }}>{formatINR(p.askingPrice)}</td>
                    <td className="px-5 py-3.5">
                      <ReviewActions action={reviewListing} hiddenFields={{ propertyId: p.id }} approveValue="LIVE" approveLabel="Approve" rejectLabel="Reject" />
                    </td>
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
