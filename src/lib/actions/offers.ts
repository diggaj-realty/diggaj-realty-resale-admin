'use server'

import { getServerSession, type Session } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function makeOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId'))
  const amount = Number(formData.get('amount'))
  if (!propertyId || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid offer')

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { sellerId: true, title: true } })
  if (!property) throw new Error('Property not found')

  await prisma.offer.create({
    data: { propertyId, buyerId: session.user.id, amount },
  })

  await prisma.notification.create({
    data: {
      userId: property.sellerId,
      title: 'New offer received',
      message: `${session.user.name} made an offer on ${property.title}.`,
    },
  })

  revalidatePath('/dashboard/browse')
  revalidatePath('/dashboard')
}

/** Shared by acceptOffer and acceptCounter: creates the Deal, auto-rejects sibling
 *  non-terminal offers on the same property, notifies the buyer and (if not already
 *  involved) the seller. Not exported — internal helper only. */
async function finalizeAcceptance(offerId: string, agreedPrice: number) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new Error('Offer not found')

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

  await prisma.deal.create({
    data: {
      propertyId: offer.property.id,
      buyerId: offer.buyerId,
      sellerId: offer.property.sellerId,
      agentId: null,
      agreedPrice,
      status: 'IN_PROGRESS',
    },
  })

  await prisma.offer.updateMany({
    where: {
      propertyId: offer.property.id,
      id: { not: offerId },
      status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
    },
    data: { status: 'REJECTED' },
  })

  await prisma.notification.create({
    data: {
      userId: offer.buyerId,
      title: 'Offer accepted',
      message: `Your offer on ${offer.property.title} was accepted.`,
    },
  })
  await prisma.notification.create({
    data: {
      userId: offer.property.sellerId,
      title: 'Deal started',
      message: `An offer on ${offer.property.title} was accepted and a deal has started.`,
    },
  })

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

async function requireSellerOwnedPendingOffer(offerId: string, session: Session) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new Error('Offer not found')
  if (offer.property.sellerId !== session.user.id) throw new Error('Unauthorized')
  if (offer.status !== 'PENDING') throw new Error('Offer is not awaiting seller action')
  return offer
}

export async function acceptOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SELLER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await finalizeAcceptance(offerId, offer.amount)
}

export async function rejectOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SELLER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })

  await prisma.notification.create({
    data: {
      userId: offer.buyerId,
      title: 'Offer rejected',
      message: `Your offer on ${offer.property.title} was rejected.`,
    },
  })

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}

export async function counterOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SELLER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const counterAmount = Number(formData.get('counterAmount'))
  if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new Error('Invalid counter amount')

  const offer = await requireSellerOwnedPendingOffer(offerId, session)

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'COUNTERED', counterAmount, counterBy: 'SELLER' },
  })

  await prisma.notification.create({
    data: {
      userId: offer.buyerId,
      title: 'Offer countered',
      message: `Your offer on ${offer.property.title} received a counter of ${counterAmount}.`,
    },
  })

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}

async function requireBuyerOwnedCounteredOffer(offerId: string, session: Session) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
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

  await finalizeAcceptance(offerId, offer.counterAmount)
}

export async function rejectCounter(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const offerId = String(formData.get('offerId'))
  const offer = await requireBuyerOwnedCounteredOffer(offerId, session)

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })

  await prisma.notification.create({
    data: {
      userId: offer.property.sellerId,
      title: 'Offer rejected',
      message: `The buyer rejected the counter offer on ${offer.property.title}.`,
    },
  })

  revalidatePath('/dashboard/offers')
  revalidatePath('/dashboard')
}
