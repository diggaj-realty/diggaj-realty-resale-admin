import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { notifyUsers } from '@/lib/notify'
import { prisma } from '@/lib/prisma'
import { respondToCostSheet, costSheetErrorMessage } from '@/lib/data/costSheets'

/** The buyer responding to the cost breakdown sent to them.
 *
 *  BUYER-only, deliberately — the point of a disclosure is that the person being
 *  charged is the one who accepts it. Staff cannot acknowledge on their behalf,
 *  for the same reason they can no longer tick "buyer confirmed" on a negotiated
 *  price.
 *
 *  `action: 'acknowledge'` — I've seen this and I accept it.
 *  `action: 'query'` — with an optional `lineId`, so the question is attached to
 *  the line it is about ("what is the club membership for?") rather than being an
 *  unattributable complaint about the whole sheet. An open query blocks the deal's
 *  stage from advancing.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER'])
  const { id: pathDealId, sheetId } = await ctx.params

  const body = await readJson<{ action?: string; lineId?: string; note?: string }>(req)
  const action = String(body.action ?? '')
  if (action !== 'acknowledge' && action !== 'query') {
    throw new ApiError("action must be 'acknowledge' or 'query'", 400)
  }

  // The sheet is found by its own id, so a mismatched deal segment would act on a
  // different deal than the URL claims. Nothing leaks — ownership is checked on
  // the record — but the route should not accept a URL that lies.
  const onDeal = await prisma.costSheet.findFirst({ where: { id: sheetId, dealId: pathDealId }, select: { id: true } })
  if (!onDeal) throw new ApiError('Cost sheet not found on this deal', 404)

  const result = await respondToCostSheet({
    sheetId,
    action,
    lineId: body.lineId ?? null,
    note: body.note ?? null,
    actorId: user.id,
  })
  if ('error' in result) {
    const { message, status } = costSheetErrorMessage(result.error)
    throw new ApiError(message, status)
  }

  const { dealId, agentId, lineLabel } = result

  if (action === 'acknowledge') {
    if (agentId) {
      await notifyUsers([
        {
          userId: agentId,
          title: 'Cost breakdown acknowledged',
          message: 'The buyer has accepted the cost breakdown you sent.',
        },
      ])
    }
  } else {
    // Backend is told alongside the agent: an open query stalls the deal, and the
    // desk chases what the agent may not get to today.
    const staff = await prisma.user.findMany({ where: { role: 'BACKEND', isActive: true }, select: { id: true } })
    await notifyUsers(
      [...(agentId ? [agentId] : []), ...staff.map((s) => s.id)].map((userId) => ({
        userId,
        title: 'Buyer queried the cost breakdown',
        message: `The buyer has a question about${lineLabel ? ` "${lineLabel}" on` : ''} the cost breakdown.${result.sheet.queryNote ? ` "${result.sheet.queryNote}"` : ''}`,
      }))
    )
  }

  return ok({
    id: result.sheet.id,
    dealId,
    status: result.sheet.status,
    acknowledgedAt: result.sheet.acknowledgedAt?.toISOString() ?? null,
    queriedAt: result.sheet.queriedAt?.toISOString() ?? null,
    queryNote: result.sheet.queryNote,
    queriedLineId: result.sheet.queriedLineId,
    isQueryOpen: result.sheet.queriedAt != null && result.sheet.resolvedAt == null,
  })
})
