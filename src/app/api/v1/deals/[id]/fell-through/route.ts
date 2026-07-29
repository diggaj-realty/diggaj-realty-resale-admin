import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'
import { collapseDeal, DEAL_FAILURE_CODES } from '@/lib/data/dealCollapse'
import { notifyUsers } from '@/lib/notify'

/** Records a deal as fallen through and returns the property to the market.
 *
 *  The counterpart to POST /deals/:id/close, but with no gate: closure has a
 *  configurable checklist because money has moved, whereas a collapse just needs
 *  recording the moment staff hear about it. The deal row survives — it is the
 *  property's real history and the basis for win/loss reporting.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ failureCode?: string; failureNote?: string }>(req)
  const failureCode = String(body.failureCode ?? '')

  const result = await collapseDeal({
    dealId,
    failureCode,
    failureNote: body.failureNote ?? null,
    actorId: user.id,
    actorRole: user.role,
  })

  if ('error' in result) {
    switch (result.error) {
      case 'NOT_FOUND':
        throw new ApiError('Deal not found', 404)
      case 'FORBIDDEN':
        throw new ApiError('Forbidden', 403)
      case 'ALREADY_CLOSED':
        throw new ApiError('A closed deal cannot be marked as fallen through', 409)
      case 'ALREADY_FAILED':
        throw new ApiError('This deal is already recorded as fallen through', 409)
      case 'INVALID_REASON':
        throw new ApiError(`failureCode must be one of: ${DEAL_FAILURE_CODES.join(', ')}`, 400)
    }
  }

  const { deal } = result
  const relistNote = deal.relisted ? ' The listing is live again.' : ''
  await notifyUsers([
    {
      userId: deal.buyerId,
      title: 'Deal did not go through',
      message: `Your deal on ${deal.propertyTitle} has been closed out as unsuccessful.`,
    },
    {
      userId: deal.sellerId,
      title: 'Deal did not go through',
      message: `The deal on ${deal.propertyTitle} did not complete.${relistNote}`,
    },
  ])

  const updated = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })
  return ok(dealDTO(updated))
})
