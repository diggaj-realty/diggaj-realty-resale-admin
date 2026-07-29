import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import DealPaymentForms from '@/components/dashboard/DealPaymentForms'
import DealFellThroughForm from '@/components/dashboard/DealFellThroughForm'
import DealStageControl from '@/components/dashboard/DealStageControl'
import { getDealStageView } from '@/lib/data/dealStageControl'
import { currentOfflineNegotiation } from '@/lib/data/offlineNegotiation'
import { currentCostSheet } from '@/lib/data/costSheets'
import CostSheetPanel from '@/components/dashboard/CostSheetPanel'
import { STAGE_LABELS } from '@/lib/data/dealProgress'
import { DEAL_FAILURE_LABELS, type DealFailureCode } from '@/lib/dealFailureCodes'
import DealLog from '@/components/dashboard/DealLog'
import DealDocuments from '@/components/dashboard/DealDocuments'

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
      logEntries: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!deal) redirect('/dashboard/deals')

  // BACKEND now sees (and can work) every deal, same as ADMIN — they run
  // paperwork/closing day to day and were previously locked out of this
  // page entirely (see commissionAmount's role check below, which already
  // expected BACKEND to be here — it just could never be reached).
  const isStaff = role === 'ADMIN' || role === 'BACKEND'
  const isRelated =
    isStaff ||
    deal.buyer.id === userId ||
    deal.seller.id === userId ||
    (role === 'AGENT' && deal.agent?.id === userId)

  if (!isRelated) redirect('/dashboard')

  const isAssignedAgent = role === 'AGENT' && deal.agent?.id === userId
  const canManage = isAssignedAgent || isStaff

  const stageView = await getDealStageView(dealId)
  const liveNegotiation = await currentOfflineNegotiation(dealId)
  const costSheet = await currentCostSheet(dealId)
  // Reconcile against the *confirmed* figure, not Deal.agreedPrice — that may
  // still hold the original accepted offer.
  const confirmedAmount =
    liveNegotiation && liveNegotiation.buyerConfirmed && liveNegotiation.sellerConfirmed
      ? liveNegotiation.agreedAmount
      : liveNegotiation
        ? null
        : deal.agreedPrice
  // Actor names resolved separately: DealStageChange stores only the id, so that
  // the log survives a staff member being deactivated or removed.
  const stageChanges = await prisma.dealStageChange.findMany({
    where: { dealId },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })
  const stageActors = await prisma.user.findMany({
    where: { id: { in: [...new Set(stageChanges.map((c) => c.actorId))] } },
    select: { id: true, name: true },
  })
  const actorNameById = new Map(stageActors.map((u) => [u.id, u.name]))

  return (
    <DashboardEntrance>
      <PageHeader
        title={deal.property.title}
        subtitle={`${deal.property.location} · Agreed Price: ${formatINR(deal.agreedPrice)}`}
        action={<StatusPill status={deal.status} />}
      />

      {stageView && (
        <div className="mb-6" data-animate="fade-up">
          <DealStageControl
            dealId={deal.id}
            effectiveLabel={stageView.effectiveLabel}
            source={stageView.source}
            derivedLabel={STAGE_LABELS[stageView.derived]}
            options={stageView.options}
            needsAmount={!liveNegotiation}
            readOnly={!canManage || deal.status !== 'IN_PROGRESS'}
            history={stageChanges.map((c) => ({
              id: c.id,
              fromStage: c.fromStage,
              toStage: c.toStage,
              direction: c.direction,
              reason: c.reason,
              actorRole: c.actorRole,
              actorName: actorNameById.get(c.actorId) ?? null,
              createdAt: c.createdAt,
            }))}
          />
        </div>
      )}

      <div className="mb-6" data-animate="fade-up">
        <CostSheetPanel
          dealId={deal.id}
          canAuthor={canManage && deal.status === 'IN_PROGRESS'}
          agreedAmount={confirmedAmount}
          sheet={
            costSheet
              ? {
                  id: costSheet.id,
                  version: costSheet.version,
                  status: costSheet.status,
                  sentAt: costSheet.sentAt?.toISOString() ?? null,
                  acknowledgedAt: costSheet.acknowledgedAt?.toISOString() ?? null,
                  queriedAt: costSheet.queriedAt?.toISOString() ?? null,
                  queryNote: costSheet.queryNote,
                  queriedLineId: costSheet.queriedLineId,
                  isQueryOpen: costSheet.queriedAt != null && costSheet.resolvedAt == null,
                  lines: costSheet.lines.map((l) => ({
                    id: l.id,
                    label: l.label,
                    amount: l.amount,
                    category: l.category,
                    note: l.note,
                    sharedWithBuyer: l.sharedWithBuyer,
                  })),
                }
              : null
          }
        />
      </div>

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
            {deal.commissionAmount != null && isStaff && (
              <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Commission</dt><dd style={{ color: 'var(--text-1)' }}>{formatINR(deal.commissionAmount)}</dd></div>
            )}
            <div className="flex justify-between"><dt style={{ color: 'var(--text-3)' }}>Status</dt><dd><StatusPill status={deal.status} /></dd></div>
          </dl>
          {deal.notes && !canManage && (
            <div className="mt-5">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Notes</h4>
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>{deal.notes}</p>
            </div>
          )}
        </div>

        {canManage && deal.status === 'IN_PROGRESS' ? (
          <div className="flex flex-col gap-6">
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
            <DealFellThroughForm dealId={deal.id} alreadyFailed={false} />
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center gap-1 p-6 text-center text-sm" style={{ color: 'var(--text-3)' }} data-animate="fade-up">
            {deal.status === 'CLOSED' ? (
              'This deal is closed.'
            ) : deal.status === 'FELL_THROUGH' ? (
              <>
                <span>This deal fell through{deal.failureCode ? `: ${DEAL_FAILURE_LABELS[deal.failureCode as DealFailureCode] ?? deal.failureCode}` : ''}.</span>
                {deal.failureNote && <span className="text-xs">{deal.failureNote}</span>}
                {deal.failedAt && <span className="text-xs">Recorded {formatDate(deal.failedAt)}</span>}
              </>
            ) : (
              'Read-only view — only the assigned agent or staff can update this deal.'
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <DealLog
          dealId={deal.id}
          canPost={canManage}
          entries={deal.logEntries.map((e) => ({
            id: e.id,
            message: e.message,
            authorRole: e.authorRole,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </div>

      <div className="mt-6">
        <DealDocuments
          dealId={deal.id}
          canManage={canManage}
          documents={deal.documents.map((d) => ({
            id: d.id,
            docType: d.docType,
            requiredFrom: d.requiredFrom,
            status: d.status,
            fileUrl: d.fileUrl,
            remarks: d.remarks,
          }))}
        />
      </div>
    </DashboardEntrance>
  )
}
