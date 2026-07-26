import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offlineNegotiationDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'

/** The assigned agent, or backend/admin. Buyers and sellers are subjects of an
 *  offline negotiation record, never its author — an agreement reached in person
 *  is logged by the staff member who witnessed it. */
async function requireDealStaff(dealId: string, user: { id: string; role: string }) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isAssignedAgent = user.role === 'AGENT' && deal.agentId === user.id
  const isBackendOrAdmin = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isAssignedAgent && !isBackendOrAdmin) throw new ApiError('Forbidden', 403)

  return deal
}

/** Offline negotiation history for a deal, newest first. Visible to the deal's
 *  own buyer/seller too — they were party to the conversation being recorded. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isParticipant = deal.buyerId === user.id || deal.sellerId === user.id || deal.agentId === user.id
  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isParticipant && !isStaff) throw new ApiError('Forbidden', 403)

  const records = await prisma.offlineNegotiation.findMany({
    where: { dealId },
    orderBy: { createdAt: 'desc' },
    include: { recordedBy: { select: { name: true } } },
  })

  return ok(records.map(offlineNegotiationDTO))
})

/** Records what the buyer and seller agreed off-platform. Additive — this never
 *  overwrites the Offer/OfferEvent history, so the platform negotiation record
 *  and the real-world one stay separately auditable. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params
  const deal = await requireDealStaff(dealId, user)

  const body = await readJson<{
    agreedAmount?: number
    buyerConfirmed?: boolean
    sellerConfirmed?: boolean
    notes?: string
  }>(req)

  const agreedAmount = Number(body.agreedAmount)
  if (!Number.isFinite(agreedAmount) || agreedAmount <= 0) {
    throw new ApiError('agreedAmount must be a positive number', 400)
  }

  const record = await prisma.offlineNegotiation.create({
    data: {
      dealId,
      agreedAmount,
      buyerConfirmed: body.buyerConfirmed === true,
      sellerConfirmed: body.sellerConfirmed === true,
      notes: body.notes ? String(body.notes).trim() || null : null,
      recordedById: user.id,
    },
    include: { recordedBy: { select: { name: true } } },
  })

  await notifyUsers(
    [deal.buyerId, deal.sellerId].map((userId) => ({
      userId,
      title: 'Negotiation recorded',
      message: `An agreed amount of ${agreedAmount} was recorded for ${deal.property.title}.`,
    }))
  )

  return ok(offlineNegotiationDTO(record), 201)
})
