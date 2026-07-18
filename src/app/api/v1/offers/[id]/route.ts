import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'

/** Creates the Deal, auto-rejects sibling non-terminal offers on the same
 *  property, and notifies both parties. Mirrors finalizeAcceptance in
 *  src/lib/actions/offers.ts. */
async function finalizeAcceptance(offerId: string, agreedPrice: number) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new ApiError('Offer not found', 404)

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

  const deal = await prisma.deal.create({
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

  await prisma.notification.createMany({
    data: [
      { userId: offer.buyerId, title: 'Offer accepted', message: `Your offer on ${offer.property.title} was accepted.` },
      { userId: offer.property.sellerId, title: 'Deal started', message: `An offer on ${offer.property.title} was accepted and a deal has started.` },
    ],
  })

  return deal
}

type Action = 'accept' | 'reject' | 'counter' | 'acceptCounter' | 'rejectCounter'
const SELLER_ACTIONS: Action[] = ['accept', 'reject', 'counter']
const BUYER_ACTIONS: Action[] = ['acceptCounter', 'rejectCounter']

export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER'])
  const { id: offerId } = await ctx.params

  const body = await readJson<{ action?: string; counterAmount?: number }>(req)
  const action = String(body.action || '') as Action

  if (user.role === 'SELLER' && !SELLER_ACTIONS.includes(action)) {
    throw new ApiError(`Sellers may only use: ${SELLER_ACTIONS.join(', ')}`, 403)
  }
  if (user.role === 'BUYER' && !BUYER_ACTIONS.includes(action)) {
    throw new ApiError(`Buyers may only use: ${BUYER_ACTIONS.join(', ')}`, 403)
  }

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new ApiError('Offer not found', 404)

  if (action === 'accept' || action === 'reject' || action === 'counter') {
    if (offer.property.sellerId !== user.id) throw new ApiError('Unauthorized', 403)
    if (offer.status !== 'PENDING') throw new ApiError('Offer is not awaiting seller action', 400)
  } else {
    if (offer.buyerId !== user.id) throw new ApiError('Unauthorized', 403)
    if (offer.status !== 'COUNTERED') throw new ApiError('Offer is not in a countered state', 400)
  }

  switch (action) {
    case 'accept': {
      await finalizeAcceptance(offerId, offer.amount)
      break
    }
    case 'reject': {
      await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
      await prisma.notification.create({
        data: { userId: offer.buyerId, title: 'Offer rejected', message: `Your offer on ${offer.property.title} was rejected.` },
      })
      break
    }
    case 'counter': {
      const counterAmount = Number(body.counterAmount)
      if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new ApiError('Invalid counter amount', 400)
      await prisma.offer.update({
        where: { id: offerId },
        data: { status: 'COUNTERED', counterAmount, counterBy: 'SELLER' },
      })
      await prisma.notification.create({
        data: { userId: offer.buyerId, title: 'Offer countered', message: `Your offer on ${offer.property.title} received a counter of ${counterAmount}.` },
      })
      break
    }
    case 'acceptCounter': {
      if (offer.counterAmount == null) throw new ApiError('Missing counter amount', 400)
      await finalizeAcceptance(offerId, offer.counterAmount)
      break
    }
    case 'rejectCounter': {
      await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
      await prisma.notification.create({
        data: { userId: offer.property.sellerId, title: 'Offer rejected', message: `The buyer rejected the counter offer on ${offer.property.title}.` },
      })
      break
    }
  }

  const updated = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
  })

  return ok(offerDTO(updated!, { forBuyer: user.role === 'BUYER' }))
})
