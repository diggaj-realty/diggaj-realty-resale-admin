import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { propertyInterestDTO, INTEREST_STATUSES, type InterestStatus } from '@/lib/data/interests'
import { assignInterestAgent } from '@/lib/data/interests'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

const INCLUDE = {
  property: { select: { title: true, location: true, askingPrice: true, status: true, sellerId: true } },
  buyer: { select: { name: true, email: true, phone: true } },
  agent: { select: { name: true, email: true, phone: true } },
  siteVisits: { orderBy: { createdAt: 'desc' as const } },
}

/** Statuses only the operational side may set. A buyer can withdraw their own
 *  lead, but declaring the outcome of a visit or that negotiation has started is
 *  the agent's call, recorded after real-world contact. */
const STAFF_ONLY_STATUSES: InterestStatus[] = [
  'AGENT_ASSIGNED',
  'CONTACT_IN_PROGRESS',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'INTERESTED',
  'NOT_INTERESTED',
  'NEGOTIATION_IN_PROGRESS',
  'CONVERTED_TO_DEAL',
  'CLOSED',
]

export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id } = await ctx.params

  const interest = await prisma.propertyInterest.findUnique({ where: { id }, include: INCLUDE })
  if (!interest) throw new ApiError('Interest not found', 404)

  const isStaff = hasAnyRole(user, ['BACKEND', 'ADMIN'])
  const isOwnAgent = interest.agentId === user.id
  const isBuyer = interest.buyerId === user.id
  const isSeller = interest.property.sellerId === user.id
  if (!isStaff && !isOwnAgent && !isBuyer && !isSeller) throw new ApiError('Forbidden', 403)

  const dto = propertyInterestDTO(interest)
  // Seller sees that the lead exists, not the buyer's contact details.
  const payload = isSeller && !isStaff && !isOwnAgent && !isBuyer
    ? { ...dto, buyerEmail: undefined, buyerPhone: undefined }
    : dto

  return ok({
    ...payload,
    siteVisits: interest.siteVisits.map((v) => ({
      id: v.id,
      status: v.status,
      outcome: v.outcome,
      requestedDate: v.requestedDate.toISOString(),
      scheduledDate: v.scheduledDate ? v.scheduledDate.toISOString() : null,
      dealId: v.dealId,
    })),
  })
})

/** Advance a lead, or assign its agent.
 *
 *  Body is either `{ status }` or `{ agentId }`. Agent assignment is staff-only;
 *  status changes are staff/assigned-agent except that a buyer may cancel their
 *  own lead.
 */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id } = await ctx.params
  const body = await readJson<{ status?: string; agentId?: string }>(req)

  const interest = await prisma.propertyInterest.findUnique({ where: { id }, include: INCLUDE })
  if (!interest) throw new ApiError('Interest not found', 404)

  const isStaff = hasAnyRole(user, ['BACKEND', 'ADMIN'])
  const isOwnAgent = interest.agentId === user.id
  const isBuyer = interest.buyerId === user.id

  // ── Agent assignment ──
  if (body.agentId !== undefined) {
    if (!isStaff) throw new ApiError('Only backend or admin can assign an agent to a lead', 403)
    const result = await assignInterestAgent({
      interestId: id,
      agentId: String(body.agentId),
      actorId: user.id,
    })
    if ('error' in result) {
      throw new ApiError(result.error === 'INVALID_AGENT' ? 'Invalid agent' : 'Interest not found', 400)
    }
    const refreshed = await prisma.propertyInterest.findUnique({ where: { id }, include: INCLUDE })
    return ok(propertyInterestDTO(refreshed!))
  }

  // ── Status change ──
  const status = String(body.status || '').trim().toUpperCase()
  if (!status) throw new ApiError('status or agentId is required', 400)
  if (!INTEREST_STATUSES.includes(status as InterestStatus)) {
    throw new ApiError(`status must be one of: ${INTEREST_STATUSES.join(', ')}`, 400)
  }

  const isStaffOnly = STAFF_ONLY_STATUSES.includes(status as InterestStatus)
  if (isStaffOnly && !isStaff && !isOwnAgent) {
    throw new ApiError('Only the assigned agent or staff can set this status', 403)
  }
  if (!isStaffOnly && !isStaff && !isOwnAgent && !isBuyer) throw new ApiError('Forbidden', 403)

  // CONVERTED_TO_DEAL is a consequence of a deal actually being created, not
  // something to be declared by hand — otherwise a lead could claim a deal that
  // doesn't exist.
  if (status === 'CONVERTED_TO_DEAL') {
    throw new ApiError('CONVERTED_TO_DEAL is set automatically when a deal is created', 400)
  }

  const updated = await prisma.propertyInterest.update({ where: { id }, data: { status } })

  await recordAudit({
    action: 'INTEREST_STATUS_CHANGED',
    actorId: user.id,
    entity: 'PropertyInterest',
    entityId: id,
    meta: { from: interest.status, to: status },
  })

  // Tell the buyer when the outcome of their lead changes; the intermediate
  // operational states are noise to them.
  if (status === 'NOT_INTERESTED' || status === 'CANCELLED' || status === 'CLOSED') {
    if (interest.buyerId !== user.id) {
      await notifyUsers([
        {
          userId: interest.buyerId,
          title: 'Enquiry closed',
          message: `Your enquiry about ${interest.property.title} has been closed.`,
        },
      ])
    }
  }

  const refreshed = await prisma.propertyInterest.findUnique({ where: { id }, include: INCLUDE })
  return ok(propertyInterestDTO(refreshed!))
})
