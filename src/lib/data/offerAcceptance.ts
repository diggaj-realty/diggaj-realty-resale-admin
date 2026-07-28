import { prisma } from '@/lib/prisma'
import { logOfferEvent } from '@/lib/actions/offerEvents'
import { recordAudit } from '@/lib/audit'

/** Accepting an offer, in one place.
 *
 *  This was previously duplicated in three call sites (the public API route, the
 *  dashboard offer actions, and now the backend mid-negotiation actions) with
 *  only comments tying them together — a real drift risk for logic this
 *  consequential. Notifications stay with the callers, since the wording differs
 *  by surface.
 */

export class OfferAcceptanceError extends Error {
  /** 409 for a genuine conflict (already sold / already has a deal), 404 for a
   *  missing offer, so HTTP callers can map without re-deriving intent. */
  constructor(
    message: string,
    readonly kind: 'NOT_FOUND' | 'CONFLICT'
  ) {
    super(message)
  }
}

export interface AcceptedOfferResult {
  dealId: string
  buyerId: string
  sellerId: string
  agentId: string | null
  agreedPrice: number
  propertyId: string
  propertyTitle: string
}

/** Creates the Deal, locks the property, and clears competing offers.
 *
 *  Wrapped in a transaction with the invariants re-read inside it: two
 *  near-simultaneous accepts on the same property could otherwise both pass the
 *  LIVE/existing-deal checks before either write landed, leaving the loser's
 *  offer flipped to ACCEPTED and then crashing on the unique constraint instead
 *  of getting the intended conflict error.
 */
export async function acceptOfferAndOpenDeal({
  offerId,
  agreedPrice,
  actorId,
  actorRole,
}: {
  offerId: string
  agreedPrice: number
  actorId: string
  actorRole: string
}): Promise<AcceptedOfferResult> {
  let result: AcceptedOfferResult
  try {
    result = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { property: { select: { id: true, title: true, sellerId: true, agentId: true, status: true } } },
      })
      if (!offer) throw new OfferAcceptanceError('Offer not found', 'NOT_FOUND')

      // Deal.propertyId is @unique so a second deal can never persist, but
      // checking first turns a raw constraint crash into a clear message.
      if (offer.property.status !== 'LIVE') {
        throw new OfferAcceptanceError(
          'This property is no longer live — it may already be under contract with another buyer.',
          'CONFLICT'
        )
      }
      const existingDeal = await tx.deal.findUnique({ where: { propertyId: offer.property.id } })
      if (existingDeal) {
        throw new OfferAcceptanceError('This property already has a deal in progress.', 'CONFLICT')
      }

      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

      const deal = await tx.deal.create({
        data: {
          propertyId: offer.property.id,
          buyerId: offer.buyerId,
          sellerId: offer.property.sellerId,
          agentId: offer.property.agentId,
          agreedPrice,
          status: 'IN_PROGRESS',
        },
      })

      // Lock the property out of search and new offers the moment a deal starts.
      await tx.property.update({ where: { id: offer.property.id }, data: { status: 'UNDER_CONTRACT' } })

      // Everything else still in flight on this property is now moot.
      await tx.offer.updateMany({
        where: {
          propertyId: offer.property.id,
          id: { not: offerId },
          status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      })

      await recordAudit(
        {
          action: 'DEAL_CREATED',
          actorId,
          entity: 'Deal',
          entityId: deal.id,
          meta: { via: 'OFFER_ACCEPTED', offerId, agreedPrice, acceptedBy: actorRole },
        },
        tx
      )

      return {
        dealId: deal.id,
        buyerId: offer.buyerId,
        sellerId: offer.property.sellerId,
        agentId: offer.property.agentId,
        agreedPrice,
        propertyId: offer.property.id,
        propertyTitle: offer.property.title,
      }
    })
  } catch (err) {
    if (err instanceof OfferAcceptanceError) throw err
    // P2002 on Deal.propertyId — a truly simultaneous transaction lost the race
    // at the DB level rather than at our check above.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new OfferAcceptanceError('This property already has a deal in progress.', 'CONFLICT')
    }
    throw err
  }

  await logOfferEvent({ offerId, type: 'ACCEPTED', amount: agreedPrice, actorId, actorRole })
  return result
}

/** Whose move it is on an active offer.
 *
 *  PENDING means the buyer's original amount still stands, so the seller side
 *  owes a response. Once COUNTERED, whoever put the current number up is waiting
 *  on the other side.
 */
export function currentOfferTurn(offer: { status: string; counterBy: string | null }): 'BUYER' | 'SELLER' {
  if (offer.status === 'PENDING') return 'SELLER'
  return offer.counterBy === 'BUYER' ? 'SELLER' : 'BUYER'
}

/** Backend acts on the seller's side of the table.
 *
 *  The triage flow lets backend counter without involving the seller at all, so
 *  backend must be able to keep responding for the rest of the negotiation —
 *  otherwise a buyer's counter lands on a side with nobody acting for it and the
 *  conversation dead-ends.
 */
export function canActOnOffer({
  offer,
  userId,
  role,
}: {
  offer: { buyerId: string; status: string; counterBy: string | null; property: { sellerId: string } }
  userId: string
  role: string
}): 'BUYER' | 'SELLER' | null {
  const turn = currentOfferTurn(offer)
  const isBuyer = offer.buyerId === userId
  const isSellerSide =
    offer.property.sellerId === userId || role === 'BACKEND' || role === 'ADMIN'

  if (turn === 'BUYER') return isBuyer ? 'BUYER' : null
  return isSellerSide ? 'SELLER' : null
}
