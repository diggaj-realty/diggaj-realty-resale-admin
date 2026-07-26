import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import {
  recordNegotiationEvent,
  negotiationEventDTO,
  AGENT_EVENT_TYPES,
  type AgentEventType,
} from '@/lib/data/negotiations'

/** Append a step to the negotiation history.
 *
 *  Agent/staff only, because this is the agent writing down what happened on a
 *  call or at a viewing. That's exactly why it can't produce agreement: recording
 *  "the buyer will take ₹3.8cr" is the agent's account of the conversation, and
 *  the buyer still has to confirm that figure themselves via
 *  POST /negotiations/:id/confirm.
 *
 *  `PRICE_PROPOSED` puts a figure on the table for both parties to confirm, and
 *  changing it clears any confirmations already given.
 *
 *  Body: `{ eventType, amount?, note? }`
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: sessionId } = await ctx.params
  const body = await readJson<{ eventType?: string; amount?: number; note?: string }>(req)

  const eventType = String(body.eventType || '').trim().toUpperCase()
  if (!AGENT_EVENT_TYPES.includes(eventType as AgentEventType)) {
    throw new ApiError(`eventType must be one of: ${AGENT_EVENT_TYPES.join(', ')}`, 400)
  }

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    select: { agentId: true },
  })
  if (!session) throw new ApiError('Negotiation not found', 404)

  // Only the agent running this negotiation may write to it — another agent
  // recording positions on someone else's conversation would corrupt the record.
  if (user.role === 'AGENT' && session.agentId !== user.id) {
    throw new ApiError('This negotiation is assigned to another agent', 403)
  }

  const result = await recordNegotiationEvent({
    sessionId,
    actorId: user.id,
    actorRole: user.role,
    eventType: eventType as AgentEventType,
    amount: body.amount != null ? Number(body.amount) : null,
    note: body.note ? String(body.note).trim() : null,
  })

  if ('error' in result) {
    if (result.error === 'SESSION_NOT_FOUND') throw new ApiError('Negotiation not found', 404)
    if (result.error === 'SESSION_NOT_ACTIVE') throw new ApiError('This negotiation is no longer active', 400)
    throw new ApiError('amount is required and must be a positive number for this event type', 400)
  }

  const events = await prisma.negotiationEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  return ok({ events: events.map(negotiationEventDTO), confirmationsReset: result.resetsConfirmations }, 201)
})

/** The negotiation's event history on its own, for a client that only wants the
 *  timeline. Same access rule as the session itself. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: sessionId } = await ctx.params

  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    select: { buyerId: true, sellerId: true, agentId: true },
  })
  if (!session) throw new ApiError('Negotiation not found', 404)

  const isParty = session.buyerId === user.id || session.sellerId === user.id || session.agentId === user.id
  if (!isParty && !hasAnyRole(user, ['BACKEND', 'ADMIN'])) throw new ApiError('Forbidden', 403)

  const events = await prisma.negotiationEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  return ok(events.map(negotiationEventDTO))
})
