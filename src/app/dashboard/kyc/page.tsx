import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ReviewActions from '@/components/dashboard/ReviewActions'
import { reviewKyc } from '@/lib/actions/backend'

export default async function KycQueuePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const pending = await prisma.sellerKyc.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, email: true } } },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="KYC Queue" subtitle={`${pending.length} pending submission${pending.length === 1 ? '' : 's'}`} />

      <div className="card overflow-hidden" data-animate="fade-up">
        {pending.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>All caught up — no pending KYC submissions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-5 py-3">Seller</th>
                  <th className="px-5 py-3">ID Type</th>
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((k) => (
                  <tr key={k.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{k.user.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{k.user.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                        {k.idType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>
                      {new Date(k.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <ReviewActions action={reviewKyc} hiddenFields={{ kycId: k.id }} />
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
