import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN'])
  const { id } = await ctx.params

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
    },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isParticipant = deal.sellerId === user.id || deal.buyerId === user.id || deal.agentId === user.id
  if (user.role !== 'ADMIN' && !isParticipant) throw new ApiError('Unauthorized', 403)

  return ok(dealDTO(deal))
})
