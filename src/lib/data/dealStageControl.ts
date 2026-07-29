import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { currentOfflineNegotiation, hasPriceDispute } from '@/lib/data/offlineNegotiation'
import {
  computeDealProgress,
  canDeclareStage,
  resolveDealStage,
  declarableStages,
  stageIndex,
  STAGE_LABELS,
  STAGE_REJECTION_MESSAGES,
  type DealStage,
  type StageChangeRejection,
} from '@/lib/data/dealProgress'

/** Letting staff drive the progress bar by hand.
 *
 *  The bar was read-only by design — computed from records, so incapable of
 *  overstating a deal. Agents and backend need to move it anyway, because most
 *  of a resale transaction happens on phone calls the platform never sees, and a
 *  bar stuck on "offer accepted" for three weeks is its own kind of lie.
 *
 *  The compromise is in dealProgress.ts: staff may declare the coordination
 *  stages, the evidence-backed ones stay derived, and nothing can be pushed
 *  below what the records prove. This module is the write path for that.
 */

/** Everything needed to derive a deal's real stage. Kept in one place so the
 *  read used for validation matches the read the UI renders from. */
const PROGRESS_INCLUDE = {
  documents: { select: { status: true } },
  offlineNegotiations: { select: { id: true } },
  paymentRequests: { select: { status: true, amount: true } },
  identityVerifications: { select: { userId: true, status: true } },
  agreements: { select: { status: true, version: true }, orderBy: { version: 'desc' as const } },
  siteVisit: { select: { status: true, outcome: true } },
} as const

export type DealStageError =
  | StageChangeRejection
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  /** Declaring NEGOTIATION_RECORDED without saying what was agreed. The stage is
   *  a claim that a price was settled, so it is meaningless — and unauditable —
   *  without the figure. */
  | 'AMOUNT_REQUIRED'
  /** One party says the recorded price is wrong. Paperwork must not roll on over
   *  an unresolved disagreement about what is being paid. */
  | 'PRICE_DISPUTED'

export interface DealStageView {
  /** What the records prove on their own. */
  derived: DealStage
  /** What is actually displayed, and whether a person or the platform put it there. */
  effective: DealStage
  effectiveLabel: string
  source: 'DERIVED' | 'DECLARED'
  manualStage: string | null
  /** Stages staff could move to right now. */
  options: { stage: DealStage; label: string; direction: 'FORWARD' | 'BACKWARD' | 'CLEAR' }[]
}

/** The stage picture for one deal, for rendering the control. */
export async function getDealStageView(dealId: string): Promise<DealStageView | null> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: PROGRESS_INCLUDE })
  if (!deal) return null

  const derived = computeDealProgress({ ...deal, offlineNegotiations: deal.offlineNegotiations }).stage
  const resolved = resolveDealStage(derived, deal.manualStage)

  return {
    derived,
    effective: resolved.stage,
    effectiveLabel: resolved.label,
    source: resolved.source,
    manualStage: deal.manualStage,
    options: declarableStages(derived, deal.manualStage).map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      direction:
        stage === derived ? ('CLEAR' as const)
        : stageIndex(stage) > stageIndex(resolved.stage) ? ('FORWARD' as const)
        : ('BACKWARD' as const),
    })),
  }
}

/** Moves a deal's displayed stage, recording who did it and why.
 *
 *  Declaring the derived stage clears the override rather than storing it, so
 *  the deal goes back to tracking its own evidence instead of being pinned to a
 *  stage that happens to match today.
 */
export async function declareDealStage({
  dealId,
  target,
  reason,
  agreedAmount,
  actorId,
  actorRole,
}: {
  dealId: string
  target: string
  reason?: string | null
  /** Required when declaring NEGOTIATION_RECORDED. Recorded as an
   *  OfflineNegotiation in the same move, so the stage and the figure behind it
   *  can never disagree. */
  agreedAmount?: number | null
  actorId: string
  actorRole: string
}): Promise<{ error: DealStageError } | { from: DealStage; to: DealStage; direction: 'FORWARD' | 'BACKWARD' }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: PROGRESS_INCLUDE })
  if (!deal) return { error: 'NOT_FOUND' }
  if (actorRole === 'AGENT' && deal.agentId !== actorId) return { error: 'FORBIDDEN' }

  const derived = computeDealProgress({ ...deal, offlineNegotiations: deal.offlineNegotiations }).stage
  const from = resolveDealStage(derived, deal.manualStage).stage

  const verdict = canDeclareStage({ target, derived, current: deal.manualStage, dealStatus: deal.status })
  if (!verdict.ok) return { error: verdict.reason }

  const to = target as DealStage

  // Advancing over an unresolved price dispute would tell the buyer the deal is
  // progressing on a number they have just said is wrong. Reverting stays
  // allowed — that is part of how staff walk a disputed deal back.
  const advancing = stageIndex(to) > stageIndex(from)
  if (advancing && (await hasPriceDispute(dealId))) return { error: 'PRICE_DISPUTED' }

  // "A price was agreed" with no price is not a recordable claim.
  const live = await currentOfflineNegotiation(dealId)
  const needsAmount = to === 'NEGOTIATION_RECORDED' && !live
  if (needsAmount && (!agreedAmount || !Number.isFinite(agreedAmount) || agreedAmount <= 0)) {
    return { error: 'AMOUNT_REQUIRED' }
  }
  const direction = stageIndex(to) > stageIndex(from) ? 'FORWARD' : 'BACKWARD'
  // Matching the evidence means "stop overriding", not "pin here" — otherwise the
  // override silently blocks the bar from advancing on its own later.
  const nextManualStage = to === derived ? null : to

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data: { manualStage: nextManualStage } })

    if (needsAmount && agreedAmount) {
      // Both confirmations start false: the parties, not the agent, say whether
      // this is what they agreed. See src/lib/data/offlineNegotiation.ts.
      await tx.offlineNegotiation.create({
        data: { dealId, agreedAmount, notes: reason?.trim() || null, recordedById: actorId },
      })
    }

    await tx.dealStageChange.create({
      data: {
        dealId,
        fromStage: from,
        toStage: to,
        direction,
        reason: reason?.trim() || null,
        actorId,
        actorRole,
      },
    })
    await recordAudit(
      {
        action: 'DEAL_STAGE_DECLARED',
        actorId,
        entity: 'Deal',
        entityId: dealId,
        meta: { from, to, direction, derived, reason: reason?.trim() || null, cleared: nextManualStage === null },
      },
      tx
    )
  })

  return { from, to, direction }
}

export function dealStageErrorMessage(error: DealStageError): { message: string; status: number } {
  if (error === 'NOT_FOUND') return { message: 'Deal not found', status: 404 }
  if (error === 'FORBIDDEN') return { message: 'This deal is assigned to another agent', status: 403 }
  if (error === 'AMOUNT_REQUIRED') {
    return { message: 'Enter the amount that was agreed — a recorded negotiation needs its figure', status: 400 }
  }
  if (error === 'PRICE_DISPUTED') {
    return {
      message:
        'The recorded price is disputed — resolve that before moving this deal forward.',
      status: 409,
    }
  }
  return { message: STAGE_REJECTION_MESSAGES[error], status: error === 'NOT_A_STAGE' ? 400 : 409 }
}
