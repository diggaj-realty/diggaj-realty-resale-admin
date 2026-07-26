import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { confirmNegotiation, negotiationSessionDTO } from '@/lib/data/negotiations'
import { prisma } from '@/lib/prisma'

/** A party confirms the price currently on the table.
 *
 *  This is the boundary the whole agent-assisted path rests on. The caller's
 *  side is derived from who they actually are on this negotiation — buyer or
 *  seller — and they can only ever set their own flag. There is deliberately no
 *  way to express "confirm on behalf of the other party":
 *
 *    - a BUYER token sets buyerConfirmed only;
 *    - a SELLER token sets sellerConfirmed only;
 *    - an AGENT or staff member gets 403, no matter what they send.
 *
 *  An agent writing "both parties agreed" into the negotiation history is the
 *  agent's account of a conversation. It is not consent, and it cannot become a
 *  Deal on its own.
 *
 *  `agreedAmount` is optional but checked when present: it must equal the figure
 *  currently proposed, so a client holding a stale screen can't confirm a number
 *  that has since been renegotiated.
 *
 *  Both confirmations together reach agreement; creating the Deal is a separate
 *  transactional step.
 *
 *  Body: `{ agreedAmount? }`
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER'])
  const { id: sessionId } = await ctx.params
  const body = await readJson<{ agreedAmount?: number }>(req)

  const result = await confirmNegotiation({
    sessionId,
    userId: user.id,
    agreedAmount: body.agreedAmount != null ? Number(body.agreedAmount) : null,
  })

  if ('error' in result) {
    switch (result.error) {
      case 'SESSION_NOT_FOUND':
        throw new ApiError('Negotiation not found', 404)
      case 'SESSION_NOT_ACTIVE':
        throw new ApiError('This negotiation is no longer active', 400)
      case 'NOT_A_PARTY':
        // Deliberately 403 rather than 404: an agent hitting this is a real
        // authorization refusal, not a missing record.
        throw new ApiError('Only the buyer or seller on this negotiation can confirm it', 403)
      case 'NO_PROPOSED_AMOUNT':
        throw new ApiError('There is no proposed amount to confirm yet', 400)
      case 'AMOUNT_MISMATCH':
        throw new ApiError(
          `That amount no longer matches the proposal. The current proposed amount is ${result.proposedAmount}.`,
          409
        )
      case 'ALREADY_CONFIRMED':
        throw new ApiError('You have already confirmed this amount', 400)
    }
  }

  const full = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: {
      property: { select: { title: true, location: true, askingPrice: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
    },
  })

  return ok({
    ...negotiationSessionDTO(full!),
    confirmedAs: result.party,
    bothConfirmed: result.bothConfirmed,
  })
})
