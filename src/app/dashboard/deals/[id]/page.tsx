import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import DealPaymentForms from '@/components/dashboard/DealPaymentForms'

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id: userId, role } = session.user

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, name: true, email: true } },
    },
  })

  if (!deal) redirect('/dashboard/deals')

  const isRelated =
    role === 'ADMIN' ||
    deal.buyer.id === userId ||
    deal.seller.id === userId ||
    (role === 'AGENT' && deal.agent?.id === userId)

  if (!isRelated) redirect('/dashboard')

  const isAssignedAgent = role === 'AGENT' && deal.agent?.id === userId

  return (
    <DashboardEntrance>
      <PageHeader
        title={deal.property.title}
        subtitle={`${deal.property.location} · Agreed Price: ${formatINR(deal.agreedPrice)}`}
        action={<StatusPill status={deal.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Deal Summary</h3>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Buyer</dt><dd style={{ color: 'var(--text-1)' }}>{deal.buyer.name}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Seller</dt><dd style={{ color: 'var(--text-1)' }}>{deal.seller.name}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Agent</dt><dd style={{ color: 'var(--text-1)' }}>{deal.agent?.name ?? 'Unassigned'}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Agreed Price</dt><dd style={{ color: 'var(--text-1)' }}>{formatINR(deal.agreedPrice)}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Token Amount</dt><dd style={{ color: 'var(--text-1)' }}>{deal.tokenAmount ? formatINR(deal.tokenAmount) : '—'}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Token Date</dt><dd style={{ color: 'var(--text-1)' }}>{formatDate(deal.tokenDate)}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Final Amount</dt><dd style={{ color: 'var(--text-1)' }}>{deal.finalAmount ? formatINR(deal.finalAmount) : '—'}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Final Payment Date</dt><dd style={{ color: 'var(--text-1)' }}>{formatDate(deal.finalPaymentDate)}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Payment Mode</dt><dd style={{ color: 'var(--text-1)' }}>{deal.paymentMode ?? '—'}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Transaction Ref</dt><dd style={{ color: 'var(--text-1)' }}>{deal.transactionRef ?? '—'}</dd></div>
            {deal.commissionAmount != null && (role === 'ADMIN' || role === 'AGENT' || role === 'BACKEND') && (
              <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Commission</dt><dd style={{ color: 'var(--text-1)' }}>{formatINR(deal.commissionAmount)}</dd></div>
            )}
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Status</dt><dd><StatusPill status={deal.status} /></dd></div>
          </dl>
          {deal.notes && !isAssignedAgent && (
            <div className="mt-5">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Notes</h4>
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>{deal.notes}</p>
            </div>
          )}
        </div>

        {isAssignedAgent && deal.status !== 'CLOSED' ? (
          <DealPaymentForms
            dealId={deal.id}
            tokenAmount={deal.tokenAmount}
            tokenDate={deal.tokenDate}
            finalAmount={deal.finalAmount}
            finalPaymentDate={deal.finalPaymentDate}
            paymentMode={deal.paymentMode}
            transactionRef={deal.transactionRef}
            notes={deal.notes}
            canClose={!!deal.finalPaymentDate}
          />
        ) : (
          <div className="card flex items-center justify-center p-6 text-sm" style={{ color: 'var(--text-3)' }} data-animate="fade-up">
            {deal.status === 'CLOSED' ? 'This deal is closed.' : 'Read-only view — only the assigned agent can update this deal.'}
          </div>
        )}
      </div>
    </DashboardEntrance>
  )
}
