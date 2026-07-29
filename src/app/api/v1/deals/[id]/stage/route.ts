import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { getDealStageView, declareDealStage, dealStageErrorMessage } from '@/lib/data/dealStageControl'
import { prisma } from '@/lib/prisma'

/** Where this deal is, and where staff could move it.
 *
 *  `source` distinguishes a stage the platform observed from one a person
 *  declared — clients should surface that difference rather than presenting both
 *  as the same kind of fact.
 */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const view = await getDealStageView(dealId)
  if (!view) throw new ApiError('Deal not found', 404)

  if (user.role === 'AGENT') {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { agentId: true } })
    if (deal?.agentId !== user.id) throw new ApiError('Forbidden', 403)
  }

  return ok(view)
})

/** Moves the stage. Advancing past what the records prove is only possible for
 *  the coordination stages; the evidence-backed ones move on their own. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ stage?: string; reason?: string }>(req)
  const target = String(body.stage ?? '')
  if (!target) throw new ApiError('stage is required', 400)

  const result = await declareDealStage({
    dealId,
    target,
    reason: body.reason ?? null,
    actorId: user.id,
    actorRole: user.role,
  })

  if ('error' in result) {
    const { message, status } = dealStageErrorMessage(result.error)
    throw new ApiError(message, status)
  }

  return ok({ ...result, ...(await getDealStageView(dealId)) })
})
