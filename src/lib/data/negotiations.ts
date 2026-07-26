import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import type { NegotiationSession, NegotiationEvent } from '@prisma/client'

/** Agent-mediated negotiation.
 *
 *  The whole point of this module is the distinction the spec insists on:
 *
 *    an agent's record  ≠  a party's confirmation
 *
 *  The agent runs the conversation and writes down what each side said. That
 *  produces an auditable history, not an agreement. Agreement requires the buyer
 *  and the seller each to confirm the *same* figure themselves, and only then
 *  can a Deal be created. Nothing in here lets an agent (or staff) tick a
 *  confirmation on someone else's behalf.
 */

export const NEGOTIATION_CHANNELS = ['PHONE', 'IN_PERSON', 'ONLINE', 'OTHER'] as const
export type NegotiationChannel = (typeof NEGOTIATION_CHANNELS)[number]

export const NEGOTIATION_STATUSES = [
  'OPEN',
  'AGREEMENT_PENDING_CONFIRMATION',
  'AGREED',
  'FAILED',
  'CANCELLED',
] as const
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number]

/** Event types an agent may record directly. Confirmations and outcomes are
 *  excluded on purpose — those are produced by the confirm/fail endpoints as a
 *  consequence of a real action, never typed in by hand. */
export const AGENT_EVENT_TYPES = [
  'BUYER_POSITION',
  'SELLER_POSITION',
  'AGENT_NOTE',
  'BUYER_COUNTER',
  'SELLER_COUNTER',
  'PRICE_PROPOSED',
] as const
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number]

/** Event types that require an amount — a position or counter with no number
 *  isn't a negotiation step, it's a note. */
const AMOUNT_REQUIRED: readonly string[] = [
  'BUYER_POSITION',
  'SELLER_POSITION',
  'BUYER_COUNTER',
  'SELLER_COUNTER',
  'PRICE_PROPOSED',
]

export function isActiveNegotiation(status: string) {
  return status === 'OPEN' || status === 'AGREEMENT_PENDING_CONFIRMATION'
}

type SessionWithRelations = NegotiationSession & {
  property?: { title: string; location: string; askingPrice: number } | null
  buyer?: { name: string } | null
  seller?: { name: string } | null
  agent?: { name: string } | null
  events?: NegotiationEvent[]
}

export function negotiationEventDTO(e: NegotiationEvent) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    actorId: e.actorId,
    actorRole: e.actorRole,
    eventType: e.eventType,
    amount: e.amount,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }
}

export function negotiationSessionDTO(s: SessionWithRelations) {
  return {
    id: s.id,
    propertyId: s.propertyId,
    interestId: s.interestId,
    dealId: s.dealId,
    buyerId: s.buyerId,
    sellerId: s.sellerId,
    agentId: s.agentId,
    channel: s.channel,
    status: s.status,
    buyerConfirmed: s.buyerConfirmed,
    sellerConfirmed: s.sellerConfirmed,
    proposedAmount: s.proposedAmount,
    finalAgreedAmount: s.finalAgreedAmount,
    /// True only when both sides have confirmed the same figure — the gate for
    /// creating a Deal. Derived so no client has to re-implement the rule.
    readyForDeal: s.buyerConfirmed && s.sellerConfirmed && s.proposedAmount != null && s.status !== 'AGREED',
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    propertyTitle: s.property?.title,
    propertyLocation: s.property?.location,
    propertyAskingPrice: s.property?.askingPrice,
    buyerName: s.buyer?.name,
    sellerName: s.seller?.name,
    agentName: s.agent?.name,
    ...(s.events ? { events: s.events.map(negotiationEventDTO) } : {}),
  }
}

/** Records one step in the negotiation. Append-only.
 *
 *  `PRICE_PROPOSED` is special: it sets the figure both parties will be asked to
 *  confirm, and because it changes what's being agreed to, it resets any
 *  confirmations already given. Confirming ₹3.8cr must never silently become
 *  consent to ₹3.9cr.
 */
export async function recordNegotiationEvent({
  sessionId,
  actorId,
  actorRole,
  eventType,
  amount,
  note,
}: {
  sessionId: string
  actorId: string
  actorRole: string
  eventType: AgentEventType
  amount?: number | null
  note?: string | null
}) {
  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { property: { select: { title: true } } },
  })
  if (!session) return { error: 'SESSION_NOT_FOUND' as const }
  if (!isActiveNegotiation(session.status)) return { error: 'SESSION_NOT_ACTIVE' as const }

  if (AMOUNT_REQUIRED.includes(eventType)) {
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      return { error: 'AMOUNT_REQUIRED' as const }
    }
  }

  const isNewProposal = eventType === 'PRICE_PROPOSED'
  const resetsConfirmations =
    isNewProposal && (session.buyerConfirmed || session.sellerConfirmed) && session.proposedAmount !== amount

  await prisma.$transaction(async (tx) => {
    await tx.negotiationEvent.create({
      data: { sessionId, actorId, actorRole, eventType, amount: amount ?? null, note: note ?? null },
    })

    if (isNewProposal) {
      await tx.negotiationSession.update({
        where: { id: sessionId },
        data: {
          proposedAmount: amount,
          status: 'AGREEMENT_PENDING_CONFIRMATION',
          // A changed figure invalidates consent already given to the old one.
          ...(resetsConfirmations ? { buyerConfirmed: false, sellerConfirmed: false } : {}),
        },
      })
      if (resetsConfirmations) {
        await tx.negotiationEvent.create({
          data: {
            sessionId,
            actorId,
            actorRole,
            eventType: 'CONFIRMATIONS_RESET',
            amount: amount ?? null,
            note: 'Proposed amount changed — both parties must confirm again',
          },
        })
      }
    }
  })

  await recordAudit({
    action: 'NEGOTIATION_EVENT_RECORDED',
    actorId,
    entity: 'NegotiationSession',
    entityId: sessionId,
    meta: { eventType, amount: amount ?? null, resetsConfirmations },
  })

  // A new figure on the table is the one event both parties genuinely need to
  // act on; the running commentary of positions and notes is agent workspace.
  if (isNewProposal) {
    await notifyUsers(
      [session.buyerId, session.sellerId].map((userId) => ({
        userId,
        title: 'Price awaiting your confirmation',
        message: `A price of ${amount} has been proposed for ${session.property.title}. Confirm it to proceed.`,
      }))
    )
  }

  return { ok: true as const, resetsConfirmations }
}

/** Records one party's own confirmation of the proposed figure.
 *
 *  `party` is derived from who the caller actually is on this session — never
 *  from anything they send. A buyer can only ever set buyerConfirmed, a seller
 *  only sellerConfirmed, and an agent neither.
 *
 *  `agreedAmount` must match the figure currently on the table, so a stale
 *  client can't confirm a number that has since been renegotiated.
 */
export async function confirmNegotiation({
  sessionId,
  userId,
  agreedAmount,
}: {
  sessionId: string
  userId: string
  agreedAmount?: number | null
}) {
  const session = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { property: { select: { title: true } } },
  })
  if (!session) return { error: 'SESSION_NOT_FOUND' as const }
  if (!isActiveNegotiation(session.status)) return { error: 'SESSION_NOT_ACTIVE' as const }

  const isBuyer = session.buyerId === userId
  const isSeller = session.sellerId === userId
  if (!isBuyer && !isSeller) return { error: 'NOT_A_PARTY' as const }

  if (session.proposedAmount == null) return { error: 'NO_PROPOSED_AMOUNT' as const }
  if (agreedAmount != null && Number(agreedAmount) !== session.proposedAmount) {
    return { error: 'AMOUNT_MISMATCH' as const, proposedAmount: session.proposedAmount }
  }

  const party = isBuyer ? 'BUYER' : 'SELLER'
  if ((isBuyer && session.buyerConfirmed) || (isSeller && session.sellerConfirmed)) {
    return { error: 'ALREADY_CONFIRMED' as const }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.negotiationSession.update({
      where: { id: sessionId },
      data: isBuyer ? { buyerConfirmed: true } : { sellerConfirmed: true },
    })
    await tx.negotiationEvent.create({
      data: {
        sessionId,
        actorId: userId,
        actorRole: party,
        eventType: isBuyer ? 'BUYER_CONFIRMED' : 'SELLER_CONFIRMED',
        amount: s.proposedAmount,
      },
    })
    return s
  })

  await recordAudit({
    action: isBuyer ? 'BUYER_CONFIRMED' : 'SELLER_CONFIRMED',
    actorId: userId,
    entity: 'NegotiationSession',
    entityId: sessionId,
    meta: { amount: updated.proposedAmount },
  })

  const bothConfirmed = updated.buyerConfirmed && updated.sellerConfirmed

  if (bothConfirmed) {
    // Agreement is reached, but the Deal is a separate, transactional step
    // (Phase 5) — reaching agreement and creating the transaction are different
    // events and can fail independently.
    await prisma.negotiationEvent.create({
      data: {
        sessionId,
        actorId: userId,
        actorRole: party,
        eventType: 'AGREEMENT_REACHED',
        amount: updated.proposedAmount,
      },
    })
    await recordAudit({
      action: 'AGREEMENT_REACHED',
      actorId: userId,
      entity: 'NegotiationSession',
      entityId: sessionId,
      meta: { amount: updated.proposedAmount },
    })
    await notifyUsers(
      [updated.buyerId, updated.sellerId, updated.agentId].map((uid) => ({
        userId: uid,
        title: 'Agreement reached',
        message: `Both parties have confirmed ${updated.proposedAmount} for ${session.property.title}.`,
      }))
    )
  } else {
    // Tell the other side it's their turn.
    const otherPartyId = isBuyer ? updated.sellerId : updated.buyerId
    await notifyUsers([
      {
        userId: otherPartyId,
        title: 'Awaiting your confirmation',
        message: `The ${party.toLowerCase()} has confirmed ${updated.proposedAmount} for ${session.property.title}. Confirm to proceed.`,
      },
      {
        userId: updated.agentId,
        title: `${party === 'BUYER' ? 'Buyer' : 'Seller'} confirmed`,
        message: `${party === 'BUYER' ? 'The buyer' : 'The seller'} confirmed ${updated.proposedAmount} for ${session.property.title}.`,
      },
    ])
  }

  return { session: updated, party, bothConfirmed }
}
