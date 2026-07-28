import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'
import { logOfferEvent } from '@/lib/actions/offerEvents'

/** Single offer, with its full negotiation timeline (OfferEvent history) —
 *  the buyer who made it, or the seller who owns the property, can view it.
 *  List endpoints (GET /offers) intentionally omit events to stay light;
 *  fetch this when a buyer/seller opens one offer's detail/timeline view. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER'])
  const { id: offerId } = await ctx.params

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      property: { select: { title: true, location: true, sellerId: true } },
      buyer: { select: { name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!offer) throw new ApiError('Offer not found', 404)

  const isBuyer = offer.buyerId === user.id
  const isSeller = offer.property.sellerId === user.id
  if (!isBuyer && !isSeller) throw new ApiError('Forbidden', 403)
  if (isSeller && !isBuyer && offer.status === 'PENDING_REVIEW') throw new ApiError('Offer not found', 404)

  return ok(offerDTO(offer, { forBuyer: isBuyer }))
})

/** Creates the Deal, auto-rejects sibling non-terminal offers on the same
 *  property, and notifies both parties. Mirrors finalizeAcceptance in
 *  src/lib/actions/offers.ts.
 *
 *  Wrapped in a transaction: two near-simultaneous accepts on the same
 *  property (e.g. a counter-accept racing a direct accept) could otherwise
 *  both pass the LIVE/existingDeal checks before either write landed — the
 *  loser's Offer.status still flipped to ACCEPTED, then crashed on the
 *  Deal.propertyId unique constraint with a raw 500 instead of the friendly
 *  409 this function is supposed to give. */
async function finalizeAcceptance(offerId: string, agreedPrice: number, actorId: string, actorRole: string) {
  let deal
  try {
    deal = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { property: { select: { id: true, title: true, sellerId: true, agentId: true, status: true } } },
      })
      if (!offer) throw new ApiError('Offer not found', 404)

      // Defense in depth against double-selling: Deal.propertyId is @unique so a
      // second deal on the same property can never actually be created, but
      // relying on that alone means this crashes with a raw DB error instead of
      // a clear message.
      if (offer.property.status !== 'LIVE') {
        throw new ApiError('This property is no longer live — it may already be under contract with another buyer.', 409)
      }
      const existingDeal = await tx.deal.findUnique({ where: { propertyId: offer.property.id } })
      if (existingDeal) throw new ApiError('This property already has a deal in progress.', 409)

      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

      const newDeal = await tx.deal.create({
        data: {
          propertyId: offer.property.id,
          buyerId: offer.buyerId,
          sellerId: offer.property.sellerId,
          agentId: offer.property.agentId,
          agreedPrice,
          status: 'IN_PROGRESS',
        },
      })

      // Lock the property out of search/new-offers the moment a deal starts.
      await tx.property.update({ where: { id: offer.property.id }, data: { status: 'UNDER_CONTRACT' } })

      await tx.offer.updateMany({
        where: {
          propertyId: offer.property.id,
          id: { not: offerId },
          status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      })

      return { newDeal, offer }
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    // P2002 = unique constraint violation on Deal.propertyId — the transaction
    // above should already have caught this via existingDeal, but a truly
    // simultaneous transaction can still lose the race at the DB level.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new ApiError('This property already has a deal in progress.', 409)
    }
    throw err
  }

  const { newDeal, offer } = deal
  await logOfferEvent({ offerId, type: 'ACCEPTED', amount: agreedPrice, actorId, actorRole })
  await prisma.notification.createMany({
    data: [
      { userId: offer.buyerId, title: 'Offer accepted', message: `Your offer on ${offer.property.title} was accepted.` },
      { userId: offer.property.sellerId, title: 'Deal started', message: `An offer on ${offer.property.title} was accepted and a deal has started.` },
    ],
  })

  return newDeal
}

type Action = 'accept' | 'reject' | 'counter' | 'close'
const ACTIONS: Action[] = ['accept', 'reject', 'counter', 'close']

/** Whose turn it is to respond, and what amount is currently on the table.
 *  Only meaningful while status is PENDING or COUNTERED — negotiation is a
 *  simple back-and-forth: whoever DIDN'T make the most recent proposal is
 *  up next. No round limit — this can go on as many rounds as the two
 *  sides want, unlike the old model which only allowed a single counter. */
function currentTurn(offer: { status: string; counterBy: string | null }): 'BUYER' | 'SELLER' {
  if (offer.status === 'PENDING') return 'SELLER' // original amount still stands, seller/backend hasn't responded yet
  // COUNTERED: whoever proposed the current counterAmount is waiting on the other side
  return offer.counterBy === 'BUYER' ? 'SELLER' : 'BUYER'
}

function currentAmount(offer: { amount: number; counterAmount: number | null }): number {
  return offer.counterAmount ?? offer.amount
}

export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'BACKEND'])
  const { id: offerId } = await ctx.params

  const body = await readJson<{ action?: string; counterAmount?: number }>(req)
  const action = String(body.action || '') as Action

  if (!ACTIONS.includes(action)) {
    throw new ApiError(`action must be one of: ${ACTIONS.join(', ')}`, 400)
  }

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new ApiError('Offer not found', 404)

  const isBuyer = offer.buyerId === user.id
  const isSeller = offer.property.sellerId === user.id
  const isBackend = user.role === 'BACKEND'
  if (!isBuyer && !isSeller && !isBackend) throw new ApiError('Unauthorized', 403)

  if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
    throw new ApiError('This negotiation is no longer active', 400)
  }

  if (action === 'close') {
    // Any party can end a stalled negotiation at any point — no turn
    // restriction, since the whole point is "this isn't going anywhere."
    const notifyIds = new Set([offer.buyerId, offer.property.sellerId].filter((id) => id !== user.id))
    await prisma.offer.update({ where: { id: offerId }, data: { status: 'NEGOTIATION_CLOSED' } })
    await logOfferEvent({ offerId, type: 'CLOSED', actorId: user.id, actorRole: user.role })
    if (notifyIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(notifyIds).map((userId) => ({
          userId,
          title: 'Negotiation closed',
          message: `The negotiation on ${offer.property.title} was closed without an agreement.`,
        })),
      })
    }
  } else {
    // accept/reject/counter are turn-based. Backend acts *as the seller* on the
    // seller's side of the table: the triage flow lets backend counter on the
    // seller's behalf (deliberately without involving them), so if backend then
    // couldn't respond when the buyer counters back, the negotiation would
    // dead-end with nobody able to move — the seller was never brought in, and
    // the buyer is waiting on a side that has no one acting for it.
    const turn = currentTurn(offer)
    const actingAs =
      turn === 'BUYER'
        ? isBuyer
          ? 'BUYER'
          : null
        : isSeller || isBackend
          ? 'SELLER'
          : null
    if (!actingAs) {
      throw new ApiError("It's not your turn — waiting on the other party.", 403)
    }

    if (action === 'accept') {
      await finalizeAcceptance(offerId, currentAmount(offer), user.id, user.role)
    } else if (action === 'reject') {
      await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
      await logOfferEvent({ offerId, type: 'REJECTED', actorId: user.id, actorRole: user.role })
      const recipientId = actingAs === 'BUYER' ? offer.property.sellerId : offer.buyerId
      await prisma.notification.create({
        data: {
          userId: recipientId,
          title: 'Offer rejected',
          message:
            actingAs === 'BUYER'
              ? `The buyer rejected the counter offer on ${offer.property.title}.`
              : `Your offer on ${offer.property.title} was rejected.`,
        },
      })
    } else {
      const counterAmount = Number(body.counterAmount)
      if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new ApiError('Invalid counter amount', 400)
      await prisma.offer.update({
        where: { id: offerId },
        data: { status: 'COUNTERED', counterAmount, counterBy: actingAs },
      })
      await logOfferEvent({
        offerId,
        // Attribute to who actually acted, not just which side they acted for —
        // backend countering for the seller reads as COUNTERED_BACKEND, matching
        // how the triage counter is recorded. The buyer-facing *notification*
        // still says nothing about backend; only the audit trail is candid.
        type:
          actingAs === 'BUYER'
            ? 'COUNTERED_BUYER'
            : isBackend && !isSeller
              ? 'COUNTERED_BACKEND'
              : 'COUNTERED_SELLER',
        amount: counterAmount,
        actorId: user.id,
        actorRole: user.role,
      })
      const recipientId = actingAs === 'BUYER' ? offer.property.sellerId : offer.buyerId
      await prisma.notification.create({
        data: { userId: recipientId, title: 'Offer countered', message: `${actingAs === 'BUYER' ? 'The buyer countered' : 'You received a counter'} on ${offer.property.title} — ${counterAmount}.` },
      })
    }
  }

  const updated = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
  })

  return ok(offerDTO(updated!, { forBuyer: offer.buyerId === user.id }))
})
