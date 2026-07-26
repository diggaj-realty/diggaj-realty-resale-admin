import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { negotiationSessionDTO, isActiveNegotiation } from '@/lib/data/negotiations'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

const INCLUDE = {
  property: { select: { title: true, location: true, askingPrice: true } },
  buyer: { select: { name: true } },
  seller: { select: { name: true } },
  agent: { select: { name: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
}

/** One negotiation with its full event history — the auditable record of who
 *  said what, in order. Readable by the parties, the agent running it, and
 *  staff. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id } = await ctx.params

  const session = await prisma.negotiationSession.findUnique({ where: { id }, include: INCLUDE })
  if (!session) throw new ApiError('Negotiation not found', 404)

  const isParty = session.buyerId === user.id || session.sellerId === user.id || session.agentId === user.id
  if (!isParty && !hasAnyRole(user, ['BACKEND', 'ADMIN'])) throw new ApiError('Forbidden', 403)

  return ok(negotiationSessionDTO(session))
})

/** Ends a negotiation that isn't going to produce a sale.
 *
 *  Either party may walk away, and the agent or staff may close it out. Terminal
 *  — a fresh negotiation is opened rather than reviving this one, so the record
 *  of the failed attempt survives.
 *
 *  Body: `{ action: "fail" | "cancel", note? }`
 */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id } = await ctx.params
  const body = await readJson<{ action?: string; note?: string }>(req)
  const action = String(body.action || '').trim()

  if (action !== 'fail' && action !== 'cancel') {
    throw new ApiError('action must be fail or cancel', 400)
  }

  const session = await prisma.negotiationSession.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!session) throw new ApiError('Negotiation not found', 404)

  const isParty = session.buyerId === user.id || session.sellerId === user.id || session.agentId === user.id
  if (!isParty && !hasAnyRole(user, ['BACKEND', 'ADMIN'])) throw new ApiError('Forbidden', 403)

  if (!isActiveNegotiation(session.status)) {
    throw new ApiError('This negotiation is no longer active', 400)
  }

  const status = action === 'fail' ? 'FAILED' : 'CANCELLED'
  const actorRole =
    session.buyerId === user.id ? 'BUYER' : session.sellerId === user.id ? 'SELLER' : user.role

  await prisma.$transaction(async (tx) => {
    await tx.negotiationSession.update({ where: { id }, data: { status } })
    await tx.negotiationEvent.create({
      data: {
        sessionId: id,
        actorId: user.id,
        actorRole,
        eventType: 'NEGOTIATION_FAILED',
        note: body.note?.trim() || null,
      },
    })
  })

  await recordAudit({
    action: 'NEGOTIATION_FAILED',
    actorId: user.id,
    entity: 'NegotiationSession',
    entityId: id,
    meta: { status, endedBy: actorRole },
  })

  await notifyUsers(
    [session.buyerId, session.sellerId, session.agentId]
      .filter((uid) => uid !== user.id)
      .map((userId) => ({
        userId,
        title: 'Negotiation closed',
        message: `The negotiation on ${session.property.title} was closed without an agreement.`,
      }))
  )

  const full = await prisma.negotiationSession.findUnique({ where: { id }, include: INCLUDE })
  return ok(negotiationSessionDTO(full!))
})
