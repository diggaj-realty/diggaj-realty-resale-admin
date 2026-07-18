import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'

type Action = 'forward' | 'counter' | 'reject'

export const PATCH = withApi(async (req, ctx) => {
  const backendUser = await authenticate(req, ['BACKEND'])
  const { id: offerId } = await ctx.params

  const body = await readJson<{ action?: string; counterAmount?: number }>(req)
  const action = String(body.action || '') as Action
  if (!['forward', 'counter', 'reject'].includes(action)) throw new ApiError('action must be forward, counter, or reject', 400)

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true } } },
  })
  if (!offer) throw new ApiError('Offer not found', 404)
  if (offer.status !== 'PENDING_REVIEW') throw new ApiError('Offer is not awaiting backend triage', 400)

  if (action === 'forward') {
    await prisma.offer.update({
      where: { id: offerId },
      data: { status: 'PENDING', reviewedBy: backendUser.id },
    })
    await prisma.notification.create({
      data: { userId: offer.property.sellerId, title: 'New offer to review', message: `You have a new offer to review on ${offer.property.title}.` },
    })
  } else if (action === 'counter') {
    const counterAmount = Number(body.counterAmount)
    if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new ApiError('Invalid counter amount', 400)
    await prisma.offer.update({
      where: { id: offerId },
      data: { status: 'COUNTERED', counterAmount, counterBy: 'BACKEND', reviewedBy: backendUser.id },
    })
    // Seller intentionally never notified — this bypasses them. Buyer-facing copy
    // is identical to a seller-issued counter; no mention of backend/review.
    await prisma.notification.create({
      data: { userId: offer.buyerId, title: 'Offer countered', message: `Your offer on ${offer.property.title} received a counter of ${counterAmount}.` },
    })
  } else {
    await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED', reviewedBy: backendUser.id } })
    // Seller never notified — bypassed entirely. Buyer copy reads like a normal rejection.
    await prisma.notification.create({
      data: { userId: offer.buyerId, title: 'Offer rejected', message: `Your offer on ${offer.property.title} was rejected.` },
    })
  }

  const updated = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
  })

  return ok(offerDTO(updated!))
})
