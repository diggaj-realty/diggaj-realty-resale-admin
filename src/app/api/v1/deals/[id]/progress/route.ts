import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { computeDealProgress, resolveDealStage, STAGE_ORDER, STAGE_LABELS } from '@/lib/data/dealProgress'
import { currentOfflineNegotiation } from '@/lib/data/offlineNegotiation'
import { currentCostSheet } from '@/lib/data/costSheets'
import { buyerVisibleTotal } from '@/lib/costSheetFields'

/** Where a deal has got to, for the people whose sale it is.
 *
 *  The buyer and seller both see this. The seller especially had nothing: the
 *  internal dashboard redirects them away, and the deals API returned amounts and
 *  dates with no notion of stage at all — so the person whose property is being
 *  sold could not tell whether paperwork had started without ringing someone.
 *
 *  `source` says whether each stage was observed by the platform or recorded by
 *  staff. Those are different kinds of claim and clients must not present them
 *  identically — a stage a person asserted can also move backwards, and a bar that
 *  hid that distinction would lose the reader's trust the first time it did.
 */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      property: { select: { title: true, location: true } },
      documents: { select: { status: true } },
      offlineNegotiations: { select: { id: true } },
      paymentRequests: { select: { status: true, amount: true } },
      identityVerifications: { select: { userId: true, status: true } },
      agreements: { select: { status: true, version: true }, orderBy: { version: 'desc' } },
      siteVisit: { select: { status: true, outcome: true } },
    },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isParticipant = deal.buyerId === user.id || deal.sellerId === user.id || deal.agentId === user.id
  if (!isStaff && !isParticipant) throw new ApiError('Forbidden', 403)

  const isBuyer = deal.buyerId === user.id

  const derived = computeDealProgress(deal)
  const resolved = resolveDealStage(derived.stage, deal.manualStage)
  const reachedIndex = STAGE_ORDER.indexOf(resolved.stage)

  const live = await currentOfflineNegotiation(dealId)
  const priceConfirmed = live ? live.buyerConfirmed && live.sellerConfirmed : true

  // Only the buyer's own cost sheet, and only once sent. The seller is party to
  // the sale but not to what the buyer is charged — brokerage and buyer-side
  // statutory costs are not theirs, the same rule the cost-sheet endpoint applies.
  const sheet = isBuyer ? await currentCostSheet(dealId) : null
  const sentSheet = sheet && sheet.status === 'SENT' ? sheet : null

  return ok({
    dealId,
    propertyTitle: deal.property.title,
    propertyLocation: deal.property.location,
    status: deal.status,
    stage: resolved.stage,
    stageLabel: resolved.label,
    /** DERIVED — the platform observed it. DECLARED — staff recorded it. */
    source: resolved.source,
    agreedPrice: deal.agreedPrice,
    /** A recorded figure awaiting one side's confirmation is not yet the price. */
    priceConfirmed,
    ...(live
      ? {
          recordedPrice: {
            id: live.id,
            amount: live.agreedAmount,
            buyerConfirmed: live.buyerConfirmed,
            sellerConfirmed: live.sellerConfirmed,
            isDisputeOpen: live.disputedAt != null && live.resolvedAt == null,
          },
        }
      : {}),
    ...(sentSheet
      ? {
          costSheet: {
            id: sentSheet.id,
            version: sentSheet.version,
            total: buyerVisibleTotal(sentSheet.lines),
            acknowledgedAt: sentSheet.acknowledgedAt?.toISOString() ?? null,
            isQueryOpen: sentSheet.queriedAt != null && sentSheet.resolvedAt == null,
          },
        }
      : {}),
    // DEAL_FELL_THROUGH is absent from STAGE_ORDER — it is terminal and off the
    // ladder, so a collapsed deal reports every step as not reached rather than
    // pretending it stalled somewhere.
    steps: STAGE_ORDER.map((s, i) => ({
      stage: s,
      label: STAGE_LABELS[s],
      reached: reachedIndex >= 0 && i <= reachedIndex,
      current: s === resolved.stage,
    })),
    documents: derived.documents,
    // What is owed is the buyer's business; the seller sees only that payment is
    // in progress via the stage itself.
    ...(isBuyer ? { payments: derived.payments } : {}),
    ...(deal.status === 'FELL_THROUGH'
      ? { failedAt: deal.failedAt?.toISOString() ?? null, failureCode: deal.failureCode }
      : {}),
  })
})
