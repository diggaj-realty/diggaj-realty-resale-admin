'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logOfferEvent } from '@/lib/actions/offerEvents'
import { notifyUsers } from '@/lib/notify'

async function requireBackend() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BACKEND') throw new Error('Unauthorized')
  return session
}

export async function reviewKyc(formData: FormData) {
  await requireBackend()
  const kycId = String(formData.get('kycId'))
  const decision = String(formData.get('decision')) as 'APPROVED' | 'REJECTED'

  const kyc = await prisma.sellerKyc.update({
    where: { id: kycId },
    data: { status: decision },
  })

  await notifyUsers([
    {
      userId: kyc.userId,
      title: decision === 'APPROVED' ? 'KYC approved' : 'KYC rejected',
      message: decision === 'APPROVED'
        ? 'Your seller KYC has been verified. You can now publish listings.'
        : 'Your KYC submission was rejected. Please resubmit your documents.',
    },
  ])

  revalidatePath('/dashboard/kyc')
  revalidatePath(`/dashboard/kyc/${kycId}`)
  revalidatePath('/dashboard')
}

export async function reviewListing(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN')) throw new Error('Unauthorized')
  const propertyId = String(formData.get('propertyId'))
  const decision = String(formData.get('decision')) as 'LIVE' | 'REJECTED'

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { status: decision, verifiedAt: decision === 'LIVE' ? new Date() : null },
  })

  await notifyUsers([
    {
      userId: property.sellerId,
      title: decision === 'LIVE' ? 'Listing approved' : 'Listing rejected',
      message: decision === 'LIVE'
        ? `${property.title} is now live on the platform.`
        : `${property.title} was rejected during verification.`,
    },
  ])

  revalidatePath('/dashboard/queue')
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/listings/${propertyId}`)
}

const SELLER_PLANS = ['BASIC', 'ELITE'] as const

export async function updatePropertyPlan(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN')) throw new Error('Unauthorized')
  const propertyId = String(formData.get('propertyId'))
  const plan = String(formData.get('plan'))
  if (!SELLER_PLANS.includes(plan as (typeof SELLER_PLANS)[number])) throw new Error('Invalid plan')

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { plan },
  })

  await notifyUsers([
    {
      userId: property.sellerId,
      title: 'Listing plan updated',
      message: `${property.title} has been moved to the ${plan.replace('_', ' ')} plan.`,
    },
  ])

  revalidatePath('/dashboard/listings')
  revalidatePath(`/dashboard/listings/${propertyId}`)
  revalidatePath('/dashboard')
}

async function requirePendingReviewOffer(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { property: { select: { id: true, title: true, sellerId: true, agentId: true } } },
  })
  if (!offer) throw new Error('Offer not found')
  if (offer.status !== 'PENDING_REVIEW') throw new Error('Offer is not awaiting backend triage')
  return offer
}

export async function forwardOffer(formData: FormData) {
  const session = await requireBackend()
  const offerId = String(formData.get('offerId'))
  const offer = await requirePendingReviewOffer(offerId)

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'PENDING', reviewedBy: session.user.id },
  })
  await logOfferEvent({ offerId, type: 'FORWARDED', actorId: session.user.id, actorRole: 'BACKEND' })

  const recipients = new Set([
    offer.property.sellerId,
    ...(offer.property.agentId ? [offer.property.agentId] : []),
  ])
  await notifyUsers(
    Array.from(recipients).map((userId) => ({
      userId,
      title: 'New offer to review',
      message: `You have a new offer to review on ${offer.property.title}.`,
    }))
  )

  revalidatePath('/dashboard/negotiations')
  revalidatePath('/dashboard')
}

export async function counterOfferAsBackend(formData: FormData) {
  const session = await requireBackend()
  const offerId = String(formData.get('offerId'))
  const counterAmount = Number(formData.get('counterAmount'))
  if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new Error('Invalid counter amount')

  const offer = await requirePendingReviewOffer(offerId)

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'COUNTERED', counterAmount, counterBy: 'BACKEND', reviewedBy: session.user.id },
  })
  await logOfferEvent({
    offerId,
    type: 'COUNTERED_BACKEND',
    amount: counterAmount,
    actorId: session.user.id,
    actorRole: 'BACKEND',
  })

  // Seller is intentionally never notified here — this bypasses them. Buyer-facing
  // copy is identical to a seller-issued counter; no mention of backend/review.
  await notifyUsers([
    {
      userId: offer.buyerId,
      title: 'Offer countered',
      message: `Your offer on ${offer.property.title} received a counter of ${counterAmount}.`,
    },
  ])

  revalidatePath('/dashboard/negotiations')
  revalidatePath('/dashboard')
}

export async function rejectOfferAsBackend(formData: FormData) {
  const session = await requireBackend()
  const offerId = String(formData.get('offerId'))
  const offer = await requirePendingReviewOffer(offerId)

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'REJECTED', reviewedBy: session.user.id },
  })
  await logOfferEvent({ offerId, type: 'REJECTED', actorId: session.user.id, actorRole: 'BACKEND' })

  // Seller never notified — bypassed entirely. Buyer copy reads like a normal rejection.
  await notifyUsers([
    {
      userId: offer.buyerId,
      title: 'Offer rejected',
      message: `Your offer on ${offer.property.title} was rejected.`,
    },
  ])

  revalidatePath('/dashboard/negotiations')
  revalidatePath('/dashboard')
}
