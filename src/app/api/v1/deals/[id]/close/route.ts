import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (deal.agentId !== user.id) throw new ApiError('Unauthorized', 403)
  if (!deal.finalPaymentDate) throw new ApiError('Record the final payment before closing the deal', 400)

  const [updated] = await prisma.$transaction([
    prisma.deal.update({ where: { id: dealId }, data: { status: 'CLOSED' } }),
    prisma.property.update({ where: { id: deal.propertyId }, data: { status: 'CLOSED' } }),
  ])

  await prisma.notification.createMany({
    data: [
      { userId: deal.buyerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
      { userId: deal.sellerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
    ],
  })

  return ok(dealDTO(updated))
})
