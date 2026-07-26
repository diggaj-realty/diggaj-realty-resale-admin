import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { paymentRequestDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'

type Action = 'initiate' | 'markPaid' | 'markFailed' | 'cancel'
const ACTIONS: Action[] = ['initiate', 'markPaid', 'markFailed', 'cancel']

/** Moves a payment request along its lifecycle:
 *
 *    PENDING → PAYMENT_INITIATED → PAID
 *                              ↘ FAILED
 *    PENDING/PAYMENT_INITIATED → CANCELLED (staff withdraw)
 *
 *  `initiate` is the only action the paying party may take — it means "I've
 *  started paying", not "I've paid". Only staff (or, once Razorpay is wired up,
 *  its verified webhook) may set PAID: a client claiming success is not proof
 *  that money moved. */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId, requestId } = await ctx.params

  const body = await readJson<{ action?: string; paymentRef?: string }>(req)
  const action = String(body.action || '') as Action
  if (!ACTIONS.includes(action)) {
    throw new ApiError(`action must be one of: ${ACTIONS.join(', ')}`, 400)
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const request = await prisma.paymentRequest.findUnique({ where: { id: requestId } })
  if (!request || request.dealId !== dealId) throw new ApiError('Payment request not found', 404)

  const isAssignedAgent = user.role === 'AGENT' && deal.agentId === user.id
  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN' || isAssignedAgent
  const payerId = request.recipient === 'SELLER' ? deal.sellerId : deal.buyerId
  const isPayer = payerId === user.id

  if (request.status === 'PAID') throw new ApiError('This payment is already settled', 400)
  if (request.status === 'CANCELLED') throw new ApiError('This payment request was cancelled', 400)

  if (action === 'initiate') {
    if (!isPayer) throw new ApiError('Only the party the payment is requested from can start it', 403)
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'PAYMENT_INITIATED' },
      include: { createdBy: { select: { name: true } } },
    })
    return ok(paymentRequestDTO(updated))
  }

  // Everything else is staff-only.
  if (!isStaff) throw new ApiError('Forbidden', 403)

  if (action === 'markPaid') {
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentRef: body.paymentRef ? String(body.paymentRef).trim() || null : null,
      },
      include: { createdBy: { select: { name: true } } },
    })
    await notifyUsers([
      {
        userId: payerId,
        title: 'Payment completed',
        message: `Your payment of ${request.amount} for ${deal.property.title} has been confirmed.`,
      },
    ])
    return ok(paymentRequestDTO(updated))
  }

  if (action === 'markFailed') {
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'FAILED' },
      include: { createdBy: { select: { name: true } } },
    })
    return ok(paymentRequestDTO(updated))
  }

  const updated = await prisma.paymentRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
    include: { createdBy: { select: { name: true } } },
  })
  return ok(paymentRequestDTO(updated))
})
