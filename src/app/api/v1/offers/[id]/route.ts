import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'
import { logOfferEvent } from '@/lib/actions/offerEvents'
import { acceptOfferAndOpenDeal, OfferAcceptanceError } from '@/lib/data/offerAcceptance'
import { notifyUsers } from '@/lib/notify'

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

/** Accepts the offer via the shared path, then notifies both parties.
 *
 *  Deal creation, the property lock, sibling-offer rejection and the
 *  simultaneous-accept race are all handled by acceptOfferAndOpenDeal. This route
 *  and the dashboard action used to each keep their own copy of that logic, tied
 *  together only by comments. Notifications stay per-surface, since the wording
 *  differs.
 */
async function finalizeAcceptance(offerId: string, agreedPrice: number, actorId: string, actorRole: string) {
  let result
  try {
    result = await acceptOfferAndOpenDeal({ offerId, agreedPrice, actorId, actorRole })
  } catch (err) {
    if (err instanceof OfferAcceptanceError) {
      throw new ApiError(err.message, err.kind === 'NOT_FOUND' ? 404 : 409)
    }
    throw err
  }

  await notifyUsers([
    { userId: result.buyerId, title: 'Offer accepted', message: `Your offer on ${result.propertyTitle} was accepted.` },
    {
      userId: result.sellerId,
      title: 'Deal started',
      message: `An offer on ${result.propertyTitle} was accepted and a deal has started.`,
    },
  ])

  return result
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
