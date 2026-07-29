import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offlineNegotiationDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'
import { formatINR } from '@/lib/format'
import {
  confirmOfflineNegotiation,
  disputeOfflineNegotiation,
  offlineNegotiationErrorMessage,
} from '@/lib/data/offlineNegotiation'
import { prisma } from '@/lib/prisma'

/** The buyer or seller responding to a price recorded on their behalf.
 *
 *  Restricted to BUYER/SELLER on purpose: this is the one action in the offline
 *  negotiation flow that staff must not be able to perform. An agent ticking
 *  "buyer confirmed" is what this endpoint exists to replace.
 *
 *  `action: 'confirm'` — yes, that is what we agreed. Once both sides say so, the
 *  figure becomes the deal's agreed price.
 *  `action: 'dispute'` — that is not the figure. Blocks the deal from advancing
 *  until staff sort it out.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER'])
  const { negotiationId } = await ctx.params

  const body = await readJson<{ action?: string; note?: string }>(req)
  const action = String(body.action ?? '')
  if (action !== 'confirm' && action !== 'dispute') {
    throw new ApiError("action must be 'confirm' or 'dispute'", 400)
  }

  if (action === 'confirm') {
    const result = await confirmOfflineNegotiation({ negotiationId, actorId: user.id })
    if ('error' in result) {
      const { message, status } = offlineNegotiationErrorMessage(result.error)
      throw new ApiError(message, status)
    }

    const { record, deal, party, bothConfirmed } = result
    const otherParty = party === 'BUYER' ? deal.sellerId : deal.buyerId
    await notifyUsers([
      ...(deal.agentId
        ? [{
            userId: deal.agentId,
            title: bothConfirmed ? 'Price confirmed by both sides' : 'Price confirmed',
            message: bothConfirmed
              ? `${formatINR(record.agreedAmount)} is now the agreed price for ${deal.property.title}.`
              : `The ${party.toLowerCase()} confirmed ${formatINR(record.agreedAmount)} for ${deal.property.title}.`,
          }]
        : []),
      ...(bothConfirmed
        ? [{
            userId: otherParty,
            title: 'Price confirmed by both sides',
            message: `${formatINR(record.agreedAmount)} is now the agreed price for ${deal.property.title}.`,
          }]
        : []),
    ])

    return ok(offlineNegotiationDTO(record))
  }

  const result = await disputeOfflineNegotiation({ negotiationId, note: body.note ?? null, actorId: user.id })
  if ('error' in result) {
    const { message, status } = offlineNegotiationErrorMessage(result.error)
    throw new ApiError(message, status)
  }

  const { record, deal, party } = result
  // Backend is told as well as the agent: a disputed price stalls the deal, and
  // the desk chases what the agent may not get to today.
  const staff = await prisma.user.findMany({
    where: { role: 'BACKEND', isActive: true },
    select: { id: true },
  })
  await notifyUsers(
    [...(deal.agentId ? [deal.agentId] : []), ...staff.map((s) => s.id)].map((userId) => ({
      userId,
      title: 'Recorded price disputed',
      message: `The ${party.toLowerCase()} says ${formatINR(record.agreedAmount)} is not what was agreed for ${deal.property.title}.${record.disputedNote ? ` "${record.disputedNote}"` : ''}`,
    }))
  )

  return ok(offlineNegotiationDTO(record))
})
