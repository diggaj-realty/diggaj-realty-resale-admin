import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { isDealFailureCode } from '@/lib/dealFailureCodes'

export { DEAL_FAILURE_CODES, DEAL_FAILURE_LABELS, isDealFailureCode } from '@/lib/dealFailureCodes'
export type { DealFailureCode } from '@/lib/dealFailureCodes'

/** Recording a sale that didn't happen.
 *
 *  Deals collapse routinely in resale — financing falls through, a buyer walks,
 *  a title problem surfaces — and until now the system had no way to say so. A
 *  deal could only be IN_PROGRESS or CLOSED, so a dead one sat in the pipeline
 *  forever while its property stayed UNDER_CONTRACT: invisible in search, unable
 *  to take new offers, and (because Deal.propertyId was @unique) unable to ever
 *  host a second deal. One collapsed sale bricked the listing permanently.
 *
 *  The deal row is kept rather than deleted. It is the honest history of the
 *  property, and the reason codes are the raw material for win/loss reporting.
 */

export type CollapseDealError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_CLOSED'
  | 'ALREADY_FAILED'
  | 'INVALID_REASON'

export interface CollapsedDeal {
  dealId: string
  propertyId: string
  propertyTitle: string
  buyerId: string
  sellerId: string
  agentId: string | null
  relisted: boolean
}

/**
 * Marks a deal FELL_THROUGH and puts the property back on the market.
 *
 *  - `activePropertyId` is cleared, which is what frees the property to host a
 *    new deal — the unique index only constrains non-null values.
 *  - The property returns to LIVE so buyers can find it again, *unless* it was
 *    already CLOSED (a sold property must not be resurrected by unwinding some
 *    unrelated deal) — hence `relisted` in the result.
 *  - A CLOSED deal cannot be collapsed. Closure runs behind the configurable
 *    closure gate and means money has moved; reversing that is an accounting
 *    correction, not an operational status change, and should not be a button.
 */
export async function collapseDeal({
  dealId,
  failureCode,
  failureNote,
  actorId,
  actorRole,
}: {
  dealId: string
  failureCode: string
  failureNote?: string | null
  actorId: string
  actorRole: string
}): Promise<{ error: CollapseDealError } | { deal: CollapsedDeal }> {
  if (!isDealFailureCode(failureCode)) return { error: 'INVALID_REASON' }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { id: true, title: true, status: true } } },
  })
  if (!deal) return { error: 'NOT_FOUND' }
  if (actorRole === 'AGENT' && deal.agentId !== actorId) return { error: 'FORBIDDEN' }
  if (deal.status === 'CLOSED') return { error: 'ALREADY_CLOSED' }
  if (deal.status === 'FELL_THROUGH') return { error: 'ALREADY_FAILED' }

  const relisted = deal.property.status !== 'CLOSED'

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: {
        status: 'FELL_THROUGH',
        activePropertyId: null,
        failedAt: new Date(),
        failureCode,
        failureNote: failureNote?.trim() || null,
        failedBy: actorId,
      },
    })

    if (relisted) {
      await tx.property.update({ where: { id: deal.propertyId }, data: { status: 'LIVE' } })
    }

    await recordAudit(
      {
        action: 'DEAL_FELL_THROUGH',
        actorId,
        entity: 'Deal',
        entityId: dealId,
        meta: { failureCode, failureNote: failureNote ?? null, propertyId: deal.propertyId, relisted, by: actorRole },
      },
      tx
    )
  })

  return {
    deal: {
      dealId,
      propertyId: deal.propertyId,
      propertyTitle: deal.property.title,
      buyerId: deal.buyerId,
      sellerId: deal.sellerId,
      agentId: deal.agentId,
      relisted,
    },
  }
}
