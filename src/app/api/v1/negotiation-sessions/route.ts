import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import {
  negotiationSessionDTO,
  NEGOTIATION_CHANNELS,
  type NegotiationChannel,
} from '@/lib/data/negotiations'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { isTerminalInterestStatus } from '@/lib/data/interests'
import type { Prisma } from '@prisma/client'

const INCLUDE = {
  property: { select: { title: true, location: true, askingPrice: true } },
  buyer: { select: { name: true } },
  seller: { select: { name: true } },
  agent: { select: { name: true } },
}

/** Agent-mediated negotiations.
 *
 *  Scoped to whoever is asking: a buyer or seller sees the negotiations they're
 *  party to, an agent sees the ones they're running, staff see everything.
 *  Note this is a *separate* resource from `/negotiations`, which is the backend
 *  triage queue for online Offers — both paths coexist by design.
 */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const status = url.searchParams.get('status')?.trim()
  const propertyId = url.searchParams.get('propertyId')?.trim()

  const where: Prisma.NegotiationSessionWhereInput = {}
  if (!hasAnyRole(user, ['BACKEND', 'ADMIN'])) {
    where.OR = [{ buyerId: user.id }, { sellerId: user.id }, { agentId: user.id }]
  }
  if (status) where.status = status
  if (propertyId) where.propertyId = propertyId

  const [items, total] = await Promise.all([
    prisma.negotiationSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: INCLUDE,
      skip,
      take,
    }),
    prisma.negotiationSession.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(negotiationSessionDTO), total, page, pageSize))
})

/** Opens an agent-mediated negotiation on a property.
 *
 *  Agent/staff only — this represents the agent picking up the phone, so it
 *  isn't something a buyer or seller starts unilaterally. Creating it does not
 *  commit anyone to anything: it's the container for the conversation, and any
 *  agreement still requires both parties to confirm a figure explicitly.
 *
 *  Body: `{ propertyId, buyerId, channel, interestId?, note? }`
 */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const body = await readJson<{
    propertyId?: string
    buyerId?: string
    interestId?: string
    channel?: string
    note?: string
  }>(req)

  const propertyId = String(body.propertyId || '').trim()
  const buyerId = String(body.buyerId || '').trim()
  const channel = String(body.channel || '').trim().toUpperCase()
  if (!propertyId) throw new ApiError('propertyId is required', 400)
  if (!buyerId) throw new ApiError('buyerId is required', 400)
  if (!NEGOTIATION_CHANNELS.includes(channel as NegotiationChannel)) {
    throw new ApiError(`channel must be one of: ${NEGOTIATION_CHANNELS.join(', ')}`, 400)
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, title: true, status: true, sellerId: true, agentId: true },
  })
  if (!property) throw new ApiError('Property not found', 404)
  if (property.status !== 'LIVE') {
    throw new ApiError('This property is no longer available to negotiate on', 400)
  }

  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { id: true, name: true } })
  if (!buyer) throw new ApiError('Buyer not found', 404)
  if (buyerId === property.sellerId) {
    throw new ApiError('The seller cannot also be the buyer on the same negotiation', 400)
  }

  // The lead, if one was given, must actually be this buyer's lead on this
  // property — otherwise the negotiation would be filed against someone else's.
  let interestId: string | null = null
  if (body.interestId) {
    const interest = await prisma.propertyInterest.findUnique({ where: { id: String(body.interestId) } })
    if (!interest) throw new ApiError('Interest not found', 404)
    if (interest.propertyId !== propertyId || interest.buyerId !== buyerId) {
      throw new ApiError('That interest does not belong to this buyer and property', 400)
    }
    interestId = interest.id
  } else {
    const existing = await prisma.propertyInterest.findUnique({
      where: { propertyId_buyerId: { propertyId, buyerId } },
    })
    interestId = existing?.id ?? null
  }

  // Who owns this operationally: the lead's agent if there is one, otherwise the
  // acting agent, otherwise the property's default. Staff opening a negotiation
  // on someone else's behalf must therefore have an agent to point at.
  const leadAgentId = interestId
    ? (await prisma.propertyInterest.findUnique({ where: { id: interestId }, select: { agentId: true } }))?.agentId
    : null
  const agentId = leadAgentId ?? (user.role === 'AGENT' ? user.id : property.agentId)
  if (!agentId) {
    throw new ApiError('Assign an agent to this property or lead before opening a negotiation', 400)
  }
  if (user.role === 'AGENT' && agentId !== user.id) {
    throw new ApiError('This lead is assigned to another agent', 403)
  }

  // One live negotiation per buyer/property — reopen or fail the existing one
  // rather than running two conversations about the same purchase.
  const openSession = await prisma.negotiationSession.findFirst({
    where: { propertyId, buyerId, status: { in: ['OPEN', 'AGREEMENT_PENDING_CONFIRMATION'] } },
  })
  if (openSession) {
    throw new ApiError('An active negotiation already exists for this buyer and property', 409)
  }

  const session = await prisma.negotiationSession.create({
    data: {
      propertyId,
      interestId,
      buyerId,
      sellerId: property.sellerId,
      agentId,
      channel,
      status: 'OPEN',
    },
  })

  if (body.note?.trim()) {
    await prisma.negotiationEvent.create({
      data: {
        sessionId: session.id,
        actorId: user.id,
        actorRole: user.role,
        eventType: 'AGENT_NOTE',
        note: body.note.trim(),
      },
    })
  }

  // Mirror onto the lead so the operational queue shows negotiation underway.
  if (interestId) {
    const interest = await prisma.propertyInterest.findUnique({
      where: { id: interestId },
      select: { status: true },
    })
    if (interest && !isTerminalInterestStatus(interest.status)) {
      await prisma.propertyInterest.update({
        where: { id: interestId },
        data: { status: 'NEGOTIATION_IN_PROGRESS' },
      })
    }
  }

  await recordAudit({
    action: 'NEGOTIATION_STARTED',
    actorId: user.id,
    entity: 'NegotiationSession',
    entityId: session.id,
    meta: { propertyId, buyerId, channel, interestId, agentId },
  })

  await notifyUsers([
    {
      userId: buyerId,
      title: 'Negotiation started',
      message: `Your agent has started a negotiation on ${property.title}.`,
    },
    {
      userId: property.sellerId,
      title: 'Negotiation started',
      message: `A negotiation has started on ${property.title}.`,
    },
  ])

  const full = await prisma.negotiationSession.findUnique({ where: { id: session.id }, include: INCLUDE })
  return ok(negotiationSessionDTO(full!), 201)
})
