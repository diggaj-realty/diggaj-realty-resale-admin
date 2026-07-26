import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { paymentRequestDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'

const RECIPIENTS = ['BUYER', 'SELLER'] as const

/** Payment requests on a deal.
 *
 *  A buyer or seller sees only the requests addressed to them — that's their
 *  "what do I owe" list. Staff see the whole history for the deal, since they
 *  need to reconcile both sides. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isBuyer = deal.buyerId === user.id
  const isSeller = deal.sellerId === user.id
  const isAgent = deal.agentId === user.id
  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isBuyer && !isSeller && !isAgent && !isStaff) throw new ApiError('Forbidden', 403)

  // Staff and the assigned agent see everything; a counterparty sees only their own.
  const seesAll = isStaff || isAgent
  const recipientFilter = isBuyer ? 'BUYER' : 'SELLER'

  const requests = await prisma.paymentRequest.findMany({
    where: { dealId, ...(seesAll ? {} : { recipient: recipientFilter }) },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  })

  return ok(requests.map(paymentRequestDTO))
})

/** Raises a payment request against the deal. Staff/agent only — the amount is
 *  set here and the recipient's frontend must render it as-is; a client is never
 *  allowed to originate or alter the figure it's being asked to pay. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isAssignedAgent = user.role === 'AGENT' && deal.agentId === user.id
  const isBackendOrAdmin = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isAssignedAgent && !isBackendOrAdmin) throw new ApiError('Forbidden', 403)

  const body = await readJson<{
    amount?: number
    recipient?: string
    title?: string
    description?: string
    dueDate?: string
  }>(req)

  const amount = Number(body.amount)
  const recipient = String(body.recipient || '').toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError('amount must be a positive number', 400)
  if (!RECIPIENTS.includes(recipient as (typeof RECIPIENTS)[number])) {
    throw new ApiError(`recipient must be one of: ${RECIPIENTS.join(', ')}`, 400)
  }

  let dueDate: Date | null = null
  if (body.dueDate) {
    dueDate = new Date(String(body.dueDate))
    if (Number.isNaN(dueDate.getTime())) throw new ApiError('dueDate must be a valid date', 400)
  }

  const request = await prisma.paymentRequest.create({
    data: {
      dealId,
      recipient,
      amount,
      title: body.title ? String(body.title).trim() || null : null,
      description: body.description ? String(body.description).trim() || null : null,
      dueDate,
      status: 'PENDING',
      createdById: user.id,
    },
    include: { createdBy: { select: { name: true } } },
  })

  await notifyUsers([
    {
      userId: recipient === 'SELLER' ? deal.sellerId : deal.buyerId,
      title: 'Payment request received',
      message: `${request.title || 'A payment'} of ${amount} is requested for ${deal.property.title}.`,
    },
  ])

  return ok(paymentRequestDTO(request), 201)
})
