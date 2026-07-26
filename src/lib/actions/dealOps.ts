'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'

/** Post-acceptance deal operations: recording negotiations that happened off
 *  the platform, and raising payment requests that surface on the buyer's or
 *  seller's own dashboard. Both are staff/agent-driven — buyers and sellers
 *  are recipients here, never the authors. */

const RECIPIENTS = ['BUYER', 'SELLER'] as const
const PURPOSES = [
  'TOKEN',
  'REGISTRATION',
  'STAMP_DUTY',
  'DOCUMENTATION',
  'FINAL_SETTLEMENT',
  'COMMISSION',
  'OTHER',
] as const

/** The assigned agent, or backend/admin. Mirrors requireDealStaff in deals.ts —
 *  paperwork and negotiation recording are day-to-day ops work, not admin-only. */
async function requireDealStaff(dealId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new Error('Deal not found')

  const { id: userId, role } = session.user
  const isAssignedAgent = role === 'AGENT' && deal.agentId === userId
  const isBackendOrAdmin = role === 'BACKEND' || role === 'ADMIN'
  if (!isAssignedAgent && !isBackendOrAdmin) throw new Error('Unauthorized')

  return { deal, userId, role }
}

function revalidateDeal(dealId: string) {
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
  revalidatePath('/dashboard/accepted-offers')
  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

/** Records what the buyer and seller agreed to face-to-face / by phone. Kept as
 *  its own row rather than overwriting the Offer — the platform negotiation
 *  history stays intact, and this sits alongside it as a separate record. */
export async function recordOfflineNegotiation(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const agreedAmount = Number(formData.get('agreedAmount'))
  const buyerConfirmed = formData.get('buyerConfirmed') === 'on' || formData.get('buyerConfirmed') === 'true'
  const sellerConfirmed = formData.get('sellerConfirmed') === 'on' || formData.get('sellerConfirmed') === 'true'
  const notes = String(formData.get('notes') || '').trim()

  if (!Number.isFinite(agreedAmount) || agreedAmount <= 0) throw new Error('Enter a valid agreed amount')

  const { deal, userId } = await requireDealStaff(dealId)

  await prisma.offlineNegotiation.create({
    data: {
      dealId,
      agreedAmount,
      buyerConfirmed,
      sellerConfirmed,
      notes: notes || null,
      recordedById: userId,
    },
  })

  await notifyUsers([
    {
      userId: deal.buyerId,
      title: 'Negotiation recorded',
      message: `An agreed amount of ${agreedAmount} was recorded for ${deal.property.title}.`,
    },
    {
      userId: deal.sellerId,
      title: 'Negotiation recorded',
      message: `An agreed amount of ${agreedAmount} was recorded for ${deal.property.title}.`,
    },
  ])

  revalidateDeal(dealId)
}

/** Raises a payment request against the deal. This does NOT record a payment —
 *  it asks the buyer or seller for one, and shows up on their dashboard with a
 *  Pay Now action. Deal.tokenAmount/finalAmount remain the separate record of
 *  money that has actually landed. */
export async function createPaymentRequest(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const amount = Number(formData.get('amount'))
  const recipient = String(formData.get('recipient') || '').toUpperCase()
  const purposeRaw = String(formData.get('purpose') || '').trim().toUpperCase()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const dueDateRaw = String(formData.get('dueDate') || '').trim()

  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount')
  if (!RECIPIENTS.includes(recipient as (typeof RECIPIENTS)[number])) {
    throw new Error(`recipient must be one of: ${RECIPIENTS.join(', ')}`)
  }
  if (purposeRaw && !PURPOSES.includes(purposeRaw as (typeof PURPOSES)[number])) {
    throw new Error(`purpose must be one of: ${PURPOSES.join(', ')}`)
  }
  const purpose = purposeRaw || null

  const { deal, userId } = await requireDealStaff(dealId)

  await prisma.paymentRequest.create({
    data: {
      dealId,
      recipient,
      amount,
      purpose,
      title: title || null,
      description: description || null,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      status: 'PENDING',
      createdById: userId,
    },
  })

  await recordAudit({
    action: 'PAYMENT_REQUESTED',
    actorId: userId,
    entity: 'PaymentRequest',
    entityId: dealId,
    meta: { amount, recipient, purpose },
  })

  await notifyUsers([
    {
      userId: recipient === 'SELLER' ? deal.sellerId : deal.buyerId,
      title: 'Payment request received',
      message: `${title || 'A payment'} of ${amount} is requested for ${deal.property.title}.`,
    },
  ])

  revalidateDeal(dealId)
}

/** Staff-side confirmation that money arrived out-of-band (bank transfer,
 *  cheque, cash). Once Razorpay is wired up its webhook becomes the other way a
 *  request reaches PAID — the frontend never sets this itself either way. */
export async function markPaymentRequestPaid(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const paymentRequestId = String(formData.get('paymentRequestId'))
  const paymentRef = String(formData.get('paymentRef') || '').trim()

  const { deal, userId } = await requireDealStaff(dealId)

  const request = await prisma.paymentRequest.findUnique({ where: { id: paymentRequestId } })
  if (!request || request.dealId !== dealId) throw new Error('Payment request not found')
  if (request.status === 'PAID') throw new Error('This payment is already marked paid')
  if (request.status === 'CANCELLED') throw new Error('This payment request was cancelled')

  await prisma.paymentRequest.update({
    where: { id: paymentRequestId },
    data: { status: 'PAID', paidAt: new Date(), paymentRef: paymentRef || null },
  })

  // Money moving is exactly the kind of privileged action that must be
  // reconstructable later.
  await recordAudit({
    action: 'PAYMENT_CONFIRMED',
    actorId: userId,
    entity: 'PaymentRequest',
    entityId: paymentRequestId,
    meta: { amount: request.amount, recipient: request.recipient, paymentRef: paymentRef || null },
  })

  await notifyUsers([
    {
      userId: request.recipient === 'SELLER' ? deal.sellerId : deal.buyerId,
      title: 'Payment completed',
      message: `Your payment of ${request.amount} for ${deal.property.title} has been confirmed.`,
    },
  ])

  revalidateDeal(dealId)
}

/** Withdraws a request that shouldn't have been sent (wrong amount, wrong
 *  party). Terminal — raise a fresh request rather than reviving this one. */
export async function cancelPaymentRequest(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const paymentRequestId = String(formData.get('paymentRequestId'))

  await requireDealStaff(dealId)

  const request = await prisma.paymentRequest.findUnique({ where: { id: paymentRequestId } })
  if (!request || request.dealId !== dealId) throw new Error('Payment request not found')
  if (request.status === 'PAID') throw new Error('A paid request cannot be cancelled')

  await prisma.paymentRequest.update({ where: { id: paymentRequestId }, data: { status: 'CANCELLED' } })

  revalidateDeal(dealId)
}
