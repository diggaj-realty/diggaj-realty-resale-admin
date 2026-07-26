'use server'

import { getServerSession, type Session } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logOfferEvent } from '@/lib/actions/offerEvents'
import { notifyUsers } from '@/lib/notify'

export async function makeOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId'))
  const amount = Number(formData.get('amount'))
  const message = String(formData.get('message') ?? '').trim()
  if (!propertyId || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid offer')

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { sellerId: true, title: true } })
  if (!property) throw new Error('Property not found')

  const offer = await prisma.offer.create({
    data: { propertyId, buyerId: session.user.id, amount, message: message || null },
  })

  await logOfferEvent({ offerId: offer.id, type: 'CREATED', amount, actorId: session.user.id, actorRole: 'BUYER' })

  await notifyUsers([
    {
      userId: property.sellerId,
      title: 'New offer received',
      message: `${session.user.name} made an offer on ${property.title}.`,
    },
  ])

  revalidatePath('/dashboard/browse')
  revalidatePath('/dashboard')
}

/** Shared by acceptOffer and acceptCounter: creates the Deal, auto-rejects sibling
 *  non-terminal offers on the same property, notifies the buyer and (if not already
 *  involved) the seller. Not exported — internal helper only.
 *
 *  Wrapped in a transaction: two near-simultaneous accepts on the same
 *  property could otherwise both pass the LIVE/existingDeal checks before
 *  either write landed — the loser's Offer.status still flipped to ACCEPTED,
 *  then crashed on the Deal.propertyId unique constraint with a raw error
 *  instead of the friendly message this function is supposed to give. */
async function finalizeAcceptance(offerId: string, agreedPrice: number, actorId: string, actorRole: string) {
  let result
  try {
    result = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { property: { select: { id: true, title: true, sellerId: true, agentId: true, status: true } } },
      })
      if (!offer) throw new Error('Offer not found')

      // Defense in depth against double-selling: Deal.propertyId is @unique so a
      // second deal on the same property can never actually be created, but
      // relying on that alone means the seller/agent sees a raw DB-constraint
      // crash instead of a clear message. Check first.
      if (offer.property.status !== 'LIVE') {
        throw new Error('This property is no longer live — it may already be under contract with another buyer.')
      }
      const existingDeal = await tx.deal.findUnique({ where: { propertyId: offer.property.id } })
      if (existingDeal) throw new Error('This property already has a deal in progress.')

      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

      await tx.deal.create({
        data: {
          propertyId: offer.property.id,
          buyerId: offer.buyerId,
          sellerId: offer.property.sellerId,
          agentId: offer.property.agentId,
          agreedPrice,
          status: 'IN_PROGRESS',
        },
      })

      // Lock the property out of search/new-offers the moment a deal starts —
      // previously it stayed LIVE the whole way through paperwork/payment,
      // so a second buyer could make (and even have accepted) a competing offer.
      await tx.property.update({ where: { id: offer.property.id }, data: { status: 'UNDER_CONTRACT' } })

      await tx.offer.updateMany({
        where: {
          propertyId: offer.property.id,
          id: { not: offerId },
          status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      })

      return offer
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new Error('This property already has a deal in progress.')
    }
    throw err
  }

  const offer = result
  await logOfferEvent({ offerId, type: 'ACCEPTED', amount: agreedPrice, actorId, actorRole })

  await notifyUsers([
    {
      userId: offer.buyerId,
      title: 'Offer accepted',
      message: `Your offer on ${offer.property.title} was accepted.`,
    },
  ])
  await notifyUsers([
    {
      userId: offer.property.sellerId,
      title: 'Deal started',
      message: `An offer on ${offer.property.title} was accepted and a deal has started.`,
    },
  ])

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

async function requireSellerOwnedPendingOffer(offerId: string, session: Session) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true, agentId: true } } },
  })
  if (!offer) throw new Error('Offer not found')
  const owns = offer.property.sellerId === session.user.id || offer.property.agentId === session.user.id
  if (!owns) throw new Error('Unauthorized')
  if (offer.status !== 'PENDING') throw new Error('Offer is not awaiting seller action')
  return offer
}

export async function acceptOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'SELLER' && session.user.role !== 'AGENT')) throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await finalizeAcceptance(offerId, offer.amount, session.user.id, session.user.role)
}

export async function rejectOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'SELLER' && session.user.role !== 'AGENT')) throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
  await logOfferEvent({ offerId, type: 'REJECTED', actorId: session.user.id, actorRole: session.user.role })

  await notifyUsers([
    {
      userId: offer.buyerId,
      title: 'Offer rejected',
      message: `Your offer on ${offer.property.title} was rejected.`,
    },
  ])

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}

export async function counterOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'SELLER' && session.user.role !== 'AGENT')) throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const counterAmount = Number(formData.get('counterAmount'))
  if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new Error('Invalid counter amount')

  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'COUNTERED', counterAmount, counterBy: 'SELLER' },
  })
  await logOfferEvent({
    offerId,
    type: 'COUNTERED_SELLER',
    amount: counterAmount,
    actorId: session.user.id,
    actorRole: session.user.role,
  })

  await notifyUsers([
    {
      userId: offer.buyerId,
      title: 'Offer countered',
      message: `Your offer on ${offer.property.title} received a counter of ${counterAmount}.`,
    },
  ])

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}

async function requireBuyerOwnedCounteredOffer(offerId: string, session: Session) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true, agentId: true } } },
  })
  if (!offer) throw new Error('Offer not found')
  if (offer.buyerId !== session.user.id) throw new Error('Unauthorized')
  if (offer.status !== 'COUNTERED') throw new Error('Offer is not in a countered state')
  return offer
}

export async function acceptCounter(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireBuyerOwnedCounteredOffer(offerId, session)

  if (offer.counterAmount == null) throw new Error('Missing counter amount')

  await logOfferEvent({
    offerId,
    type: 'COUNTER_ACCEPTED',
    amount: offer.counterAmount,
    actorId: session.user.id,
    actorRole: session.user.role,
  })
  await finalizeAcceptance(offerId, offer.counterAmount, session.user.id, session.user.role)
}

export async function rejectCounter(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireBuyerOwnedCounteredOffer(offerId, session)

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
  await logOfferEvent({ offerId, type: 'COUNTER_REJECTED', actorId: session.user.id, actorRole: session.user.role })

  const recipients = new Set([offer.property.sellerId, ...(offer.property.agentId ? [offer.property.agentId] : [])])
  await notifyUsers(
    Array.from(recipients).map((userId) => ({
      userId,
      title: 'Offer rejected',
      message: `The buyer rejected the counter offer on ${offer.property.title}.`,
    }))
  )

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}
