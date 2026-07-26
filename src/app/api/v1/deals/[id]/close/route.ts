import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'
import { evaluateClosureGate } from '@/lib/data/closureGate'
import { recordAudit } from '@/lib/audit'

/** Reports what still stands between this deal and closure.
 *
 *  Exposed so the operational UI can show the remaining checklist up front,
 *  rather than staff discovering each blocker by attempting to close and being
 *  refused one at a time. Which requirements apply is configurable — see
 *  AppConfig.closureRequires*.
 */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (user.role === 'AGENT' && deal.agentId !== user.id) throw new ApiError('Forbidden', 403)

  const gate = await evaluateClosureGate(dealId)
  if (!gate) throw new ApiError('Deal not found', 404)
  return ok(gate)
})

/** Closes the deal.
 *
 *  A deal doesn't close just because the money arrived — the paperwork, identity
 *  checks and signatures have to hold up too, per whichever of those the platform
 *  is configured to require. All unmet requirements are returned together so the
 *  caller sees the whole remaining checklist.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  // Backend/admin can close any deal; an agent only one assigned to them.
  if (user.role === 'AGENT' && deal.agentId !== user.id) throw new ApiError('Unauthorized', 403)
  if (deal.status === 'CLOSED') throw new ApiError('This deal is already closed', 400)

  const gate = await evaluateClosureGate(dealId)
  if (!gate) throw new ApiError('Deal not found', 404)
  if (!gate.canClose) throw new ApiError(gate.blockers.join('; '), 400)

  const [updated] = await prisma.$transaction([
    prisma.deal.update({ where: { id: dealId }, data: { status: 'CLOSED' } }),
    prisma.property.update({ where: { id: deal.propertyId }, data: { status: 'CLOSED' } }),
  ])

  await recordAudit({
    action: 'DEAL_CLOSED',
    actorId: user.id,
    entity: 'Deal',
    entityId: dealId,
    meta: { requirements: gate.requirements },
  })

  await prisma.notification.createMany({
    data: [
      { userId: deal.buyerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
      { userId: deal.sellerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
    ],
  })

  return ok(dealDTO(updated))
})
