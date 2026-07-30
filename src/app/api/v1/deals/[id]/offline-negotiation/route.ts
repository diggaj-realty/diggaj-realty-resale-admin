import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offlineNegotiationDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'
import { formatINR } from '@/lib/format'
import { recordOfflineNegotiation, offlineNegotiationErrorMessage } from '@/lib/data/offlineNegotiation'

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

/** Records what the buyer and seller agreed off-platform.
 *
 *  Staff record the figure; they no longer record the parties' agreement to it.
 *  `buyerConfirmed`/`sellerConfirmed` used to be accepted here and start false
 *  now regardless — each party confirms through POST
 *  /deals/:id/offline-negotiation/:negotiationId/respond, which only they can
 *  call. Until both have, the amount is a proposal and does not touch
 *  Deal.agreedPrice.
 *
 *  Additive: recording a new figure supersedes the previous one rather than
 *  editing it, so the history of what was agreed when stays intact. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ agreedAmount?: number; notes?: string }>(req)

  const result = await recordOfflineNegotiation({
    dealId,
    agreedAmount: Number(body.agreedAmount),
    notes: body.notes ?? null,
    actorId: user.id,
    actorRole: user.role,
  })
  if ('error' in result) {
    const { message, status } = offlineNegotiationErrorMessage(result.error)
    throw new ApiError(message, status)
  }

  const { record, deal } = result
  await notifyUsers(
    [deal.buyerId, deal.sellerId].map((userId) => ({
      userId,
      title: 'Agreed price recorded — please confirm',
      message: `${formatINR(record.agreedAmount)} was recorded as the agreed price for ${deal.property.title}. Confirm it, or tell us if it isn't right.`,
    }))
  )

  return ok(offlineNegotiationDTO(record), 201)
})
