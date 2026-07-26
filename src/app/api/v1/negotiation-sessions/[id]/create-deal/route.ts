import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

/** Turns a fully-confirmed negotiation into a Deal.
 *
 *  This is the agent-assisted counterpart to accepting an online Offer, and it
 *  holds to the same standard: everything happens inside one transaction with
 *  the invariants re-checked *inside* it, so two simultaneous attempts can't both
 *  produce a deal on the same property.
 *
 *  Requires both parties to have confirmed the same figure — an agent's record of
 *  a verbal agreement is not enough, by design. Staff/agent trigger this because
 *  it's the operational act of opening the transaction; the consent it relies on
 *  came from the buyer and seller themselves.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: sessionId } = await ctx.params

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { property: { select: { title: true } } },
  })
  if (!session) throw new ApiError('Negotiation not found', 404)
  if (user.role === 'AGENT' && session.agentId !== user.id) {
    throw new ApiError('This negotiation is assigned to another agent', 403)
  }
  if (session.dealId) throw new ApiError('This negotiation has already produced a deal', 409)

  // Fail fast with a readable message; the authoritative re-checks happen inside
  // the transaction below, where they're safe against concurrent attempts.
  if (session.status === 'AGREED') throw new ApiError('This negotiation has already been agreed', 409)
  if (session.status !== 'AGREEMENT_PENDING_CONFIRMATION' && session.status !== 'OPEN') {
    throw new ApiError('This negotiation is no longer active', 400)
  }
  if (!session.buyerConfirmed || !session.sellerConfirmed) {
    throw new ApiError(
      'Both the buyer and the seller must confirm the agreed amount before a deal can be created',
      400
    )
  }
  if (session.proposedAmount == null) throw new ApiError('There is no confirmed amount on this negotiation', 400)

  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      // Re-read under the transaction: between the checks above and here, the
      // property could have gone under contract or a confirmation been reset.
      const fresh = await tx.negotiationSession.findUnique({ where: { id: sessionId } })
      if (!fresh) throw new ApiError('Negotiation not found', 404)
      if (fresh.dealId || fresh.status === 'AGREED') {
        throw new ApiError('This negotiation has already produced a deal', 409)
      }
      if (!fresh.buyerConfirmed || !fresh.sellerConfirmed || fresh.proposedAmount == null) {
        throw new ApiError('Both parties must confirm the agreed amount before a deal can be created', 400)
      }

      const property = await tx.property.findUnique({
        where: { id: fresh.propertyId },
        select: { id: true, status: true, agentId: true },
      })
      if (!property) throw new ApiError('Property not found', 404)
      if (property.status !== 'LIVE') {
        throw new ApiError('This property is no longer live — it may already be under contract.', 409)
      }

      const existingDeal = await tx.deal.findUnique({ where: { propertyId: fresh.propertyId } })
      if (existingDeal) throw new ApiError('This property already has a deal in progress.', 409)

      // Use the operational agent from the negotiation, not Property.agentId —
      // the negotiation's agent is who actually handled this buyer.
      const deal = await tx.deal.create({
        data: {
          propertyId: fresh.propertyId,
          buyerId: fresh.buyerId,
          sellerId: fresh.sellerId,
          agentId: fresh.agentId,
          agreedPrice: fresh.proposedAmount,
          status: 'IN_PROGRESS',
        },
      })

      await tx.negotiationSession.update({
        where: { id: sessionId },
        data: { status: 'AGREED', finalAgreedAmount: fresh.proposedAmount, dealId: deal.id },
      })

      await tx.property.update({
        where: { id: fresh.propertyId },
        data: { status: 'UNDER_CONTRACT', agentId: fresh.agentId },
      })

      // Link the lead and its latest visit into the transaction so the whole
      // thread is traceable from the deal.
      if (fresh.interestId) {
        await tx.propertyInterest.update({
          where: { id: fresh.interestId },
          data: { status: 'CONVERTED_TO_DEAL' },
        })
        const visit = await tx.siteVisit.findFirst({
          where: { interestId: fresh.interestId, dealId: null },
          orderBy: { createdAt: 'desc' },
        })
        if (visit) await tx.siteVisit.update({ where: { id: visit.id }, data: { dealId: deal.id } })
      }

      // A confirmed agent-assisted agreement supersedes any online offers still
      // in flight on this property — same rule as accepting an offer directly.
      await tx.offer.updateMany({
        where: {
          propertyId: fresh.propertyId,
          status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      })

      // Keep the concise offline-negotiation summary the accepted-offer views
      // already read, alongside the full event history.
      await tx.offlineNegotiation.create({
        data: {
          dealId: deal.id,
          agreedAmount: fresh.proposedAmount,
          buyerConfirmed: true,
          sellerConfirmed: true,
          notes: `Agreed via ${fresh.channel.toLowerCase().replace('_', '-')} negotiation, confirmed by both parties.`,
          recordedById: fresh.agentId,
        },
      })

      await tx.negotiationEvent.create({
        data: {
          sessionId,
          actorId: user.id,
          actorRole: user.role,
          eventType: 'AGREEMENT_REACHED',
          amount: fresh.proposedAmount,
          note: 'Deal created',
        },
      })

      await recordAudit(
        {
          action: 'DEAL_CREATED',
          actorId: user.id,
          entity: 'Deal',
          entityId: deal.id,
          meta: {
            via: 'AGENT_ASSISTED_NEGOTIATION',
            sessionId,
            interestId: fresh.interestId,
            agreedPrice: fresh.proposedAmount,
          },
        },
        tx
      )

      return deal
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    // P2002 on Deal.propertyId — a genuinely simultaneous attempt lost the race
    // at the DB level rather than at our check.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new ApiError('This property already has a deal in progress.', 409)
    }
    throw err
  }

  await notifyUsers([
    {
      userId: created.buyerId,
      title: 'Deal created',
      message: `Your purchase of ${session.property.title} is confirmed at ${created.agreedPrice}. Paperwork begins now.`,
    },
    {
      userId: created.sellerId,
      title: 'Deal created',
      message: `The sale of ${session.property.title} is confirmed at ${created.agreedPrice}.`,
    },
    {
      userId: created.agentId!,
      title: 'Deal created',
      message: `The deal on ${session.property.title} is open. Start collecting documents.`,
    },
  ])

  const full = await prisma.deal.findUnique({
    where: { id: created.id },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
    },
  })

  return ok(dealDTO(full!), 201)
})
