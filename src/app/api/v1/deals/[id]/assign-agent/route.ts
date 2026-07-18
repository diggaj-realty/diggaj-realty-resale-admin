import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  await authenticate(req, ['ADMIN'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ agentId?: string }>(req)
  const agentId = String(body.agentId || '')
  if (!agentId) throw new ApiError('agentId is required', 400)

  const agent = await prisma.user.findUnique({ where: { id: agentId } })
  if (!agent || agent.role !== 'AGENT') throw new ApiError('Invalid agent', 400)

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { agentId },
    include: { property: { select: { title: true, location: true } } },
  })

  await prisma.notification.create({
    data: { userId: agentId, title: 'Assigned to a deal', message: `You've been assigned ${deal.property.title}` },
  })

  return ok(dealDTO(deal))
})
