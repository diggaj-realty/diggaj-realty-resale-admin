'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import { isTerminalInterestStatus } from '@/lib/data/interests'
import {
  recordNegotiationEvent,
  isActiveNegotiation,
  NEGOTIATION_CHANNELS,
  AGENT_EVENT_TYPES,
  type NegotiationChannel,
  type AgentEventType,
} from '@/lib/data/negotiations'

/** Dashboard-side agent-assisted negotiation.
 *
 *  Note what is deliberately absent: there is no action here for confirming on
 *  behalf of a buyer or seller. Confirmation is the party's own act, done through
 *  the public API with their own token. An agent runs the conversation and writes
 *  down what was said; they cannot consent for anyone.
 */

async function requireSessionAgent(sessionId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const negotiation = await prisma.negotiationSession.findUnique({
    where: { id: sessionId },
    include: { property: { select: { title: true } } },
  })
  if (!negotiation) throw new Error('Negotiation not found')

  const { id: userId, role } = session.user
  const isStaff = role === 'BACKEND' || role === 'ADMIN'
  if (role === 'AGENT' && negotiation.agentId !== userId) {
    throw new Error('This negotiation is assigned to another agent')
  }
  if (role !== 'AGENT' && !isStaff) throw new Error('Unauthorized')

  return { negotiation, userId, role }
}

function revalidateNegotiation(sessionId: string, interestId?: string | null) {
  revalidatePath(`/dashboard/negotiation-sessions/${sessionId}`)
  if (interestId) revalidatePath(`/dashboard/leads/${interestId}`)
  revalidatePath('/dashboard/leads')
  revalidatePath('/dashboard')
}

/** Opens a negotiation on a lead. Agent-led, because it represents the agent
 *  picking up the phone — it commits nobody to anything on its own. */
export async function startNegotiation(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const { id: userId, role } = session.user
  if (role !== 'AGENT' && role !== 'BACKEND' && role !== 'ADMIN') throw new Error('Unauthorized')

  const interestId = String(formData.get('interestId'))
  const channel = String(formData.get('channel') || '').toUpperCase()
  const note = String(formData.get('note') || '').trim()

  if (!NEGOTIATION_CHANNELS.includes(channel as NegotiationChannel)) throw new Error('Invalid channel')

  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { id: true, title: true, status: true, sellerId: true, agentId: true } } },
  })
  if (!interest) throw new Error('Lead not found')
  if (role === 'AGENT' && interest.agentId !== userId) throw new Error('This lead is assigned to another agent')
  if (interest.property.status !== 'LIVE') {
    throw new Error('This property is no longer available to negotiate on')
  }

  const agentId = interest.agentId ?? (role === 'AGENT' ? userId : interest.property.agentId)
  if (!agentId) throw new Error('Assign an agent to this lead before starting a negotiation')

  // One live conversation per buyer/property, so two negotiations can't run
  // about the same purchase.
  const open = await prisma.negotiationSession.findFirst({
    where: {
      propertyId: interest.propertyId,
      buyerId: interest.buyerId,
      status: { in: ['OPEN', 'AGREEMENT_PENDING_CONFIRMATION'] },
    },
  })
  if (open) throw new Error('An active negotiation already exists for this buyer and property')

  const created = await prisma.negotiationSession.create({
    data: {
      propertyId: interest.propertyId,
      interestId: interest.id,
      buyerId: interest.buyerId,
      sellerId: interest.property.sellerId,
      agentId,
      channel,
      status: 'OPEN',
    },
  })

  if (note) {
    await prisma.negotiationEvent.create({
      data: { sessionId: created.id, actorId: userId, actorRole: role, eventType: 'AGENT_NOTE', note },
    })
  }

  if (!isTerminalInterestStatus(interest.status)) {
    await prisma.propertyInterest.update({
      where: { id: interest.id },
      data: { status: 'NEGOTIATION_IN_PROGRESS' },
    })
  }

  await recordAudit({
    action: 'NEGOTIATION_STARTED',
    actorId: userId,
    entity: 'NegotiationSession',
    entityId: created.id,
    meta: { propertyId: interest.propertyId, buyerId: interest.buyerId, channel, interestId: interest.id },
  })

  await notifyUsers([
    {
      userId: interest.buyerId,
      title: 'Negotiation started',
      message: `Your agent has started a negotiation on ${interest.property.title}.`,
    },
    {
      userId: interest.property.sellerId,
      title: 'Negotiation started',
      message: `A negotiation has started on ${interest.property.title}.`,
    },
  ])

  revalidateNegotiation(created.id, interest.id)
}

/** Records a step in the negotiation — a party's position, a counter, a note, or
 *  a price to put to both sides for confirmation. */
export async function addNegotiationEvent(formData: FormData) {
  const sessionId = String(formData.get('sessionId'))
  const eventType = String(formData.get('eventType') || '').toUpperCase()
  const amountRaw = String(formData.get('amount') || '').trim()
  const note = String(formData.get('note') || '').trim()

  if (!AGENT_EVENT_TYPES.includes(eventType as AgentEventType)) throw new Error('Invalid event type')

  const { negotiation, userId, role } = await requireSessionAgent(sessionId)

  const result = await recordNegotiationEvent({
    sessionId,
    actorId: userId,
    actorRole: role,
    eventType: eventType as AgentEventType,
    amount: amountRaw ? Number(amountRaw) : null,
    note: note || null,
  })

  if ('error' in result) {
    if (result.error === 'SESSION_NOT_ACTIVE') throw new Error('This negotiation is no longer active')
    if (result.error === 'AMOUNT_REQUIRED') throw new Error('Enter a valid amount for this event type')
    throw new Error('Negotiation not found')
  }

  revalidateNegotiation(sessionId, negotiation.interestId)
}

/** Ends a negotiation that isn't going to produce a sale. Terminal — a fresh one
 *  is opened rather than reviving this, so the failed attempt stays on record. */
export async function endNegotiation(formData: FormData) {
  const sessionId = String(formData.get('sessionId'))
  const outcome = String(formData.get('outcome') || 'FAILED').toUpperCase()
  const note = String(formData.get('note') || '').trim()

  if (outcome !== 'FAILED' && outcome !== 'CANCELLED') throw new Error('Invalid outcome')

  const { negotiation, userId, role } = await requireSessionAgent(sessionId)
  if (!isActiveNegotiation(negotiation.status)) throw new Error('This negotiation is no longer active')

  await prisma.$transaction(async (tx) => {
    await tx.negotiationSession.update({ where: { id: sessionId }, data: { status: outcome } })
    await tx.negotiationEvent.create({
      data: {
        sessionId,
        actorId: userId,
        actorRole: role,
        eventType: 'NEGOTIATION_FAILED',
        note: note || null,
      },
    })
  })

  await recordAudit({
    action: 'NEGOTIATION_FAILED',
    actorId: userId,
    entity: 'NegotiationSession',
    entityId: sessionId,
    meta: { status: outcome },
  })

  await notifyUsers(
    [negotiation.buyerId, negotiation.sellerId].map((uid) => ({
      userId: uid,
      title: 'Negotiation closed',
      message: `The negotiation on ${negotiation.property.title} was closed without an agreement.`,
    }))
  )

  revalidateNegotiation(sessionId, negotiation.interestId)
}

/** Turns a negotiation both parties have confirmed into a Deal.
 *
 *  Mirrors the API's create-deal path: one transaction, invariants re-read
 *  inside it, so two simultaneous attempts can't both produce a deal. Refuses
 *  outright unless both confirmations are genuinely present — the whole point of
 *  the confirmation step is that staff can't shortcut it here. */
export async function createDealFromNegotiation(formData: FormData) {
  const sessionId = String(formData.get('sessionId'))
  const { negotiation, userId, role } = await requireSessionAgent(sessionId)

  if (negotiation.dealId) throw new Error('This negotiation has already produced a deal')
  if (!negotiation.buyerConfirmed || !negotiation.sellerConfirmed) {
    throw new Error('Both the buyer and the seller must confirm the agreed amount before a deal can be created')
  }
  if (negotiation.proposedAmount == null) throw new Error('There is no confirmed amount on this negotiation')

  let dealId: string
  try {
    dealId = await prisma.$transaction(async (tx) => {
      const fresh = await tx.negotiationSession.findUnique({ where: { id: sessionId } })
      if (!fresh) throw new Error('Negotiation not found')
      if (fresh.dealId || fresh.status === 'AGREED') throw new Error('This negotiation has already produced a deal')
      if (!fresh.buyerConfirmed || !fresh.sellerConfirmed || fresh.proposedAmount == null) {
        throw new Error('Both parties must confirm the agreed amount before a deal can be created')
      }

      const property = await tx.property.findUnique({
        where: { id: fresh.propertyId },
        select: { status: true },
      })
      if (!property) throw new Error('Property not found')
      if (property.status !== 'LIVE') {
        throw new Error('This property is no longer live — it may already be under contract.')
      }
      const existing = await tx.deal.findUnique({ where: { activePropertyId: fresh.propertyId } })
      if (existing) throw new Error('This property already has a deal in progress.')

      const deal = await tx.deal.create({
        data: {
          propertyId: fresh.propertyId,
          activePropertyId: fresh.propertyId,
          buyerId: fresh.buyerId,
          sellerId: fresh.sellerId,
          agentId: fresh.agentId,
          agreedPrice: fresh.proposedAmount,
          status: 'IN_PROGRESS',
        },
      })

      await tx.negotiationSession.update({
        where: { id: sessionId },
        data: { status: 'AGREED', finalAgreedAmount: fresh.proposedAmount, dealId: deal.id },
      })
      await tx.property.update({
        where: { id: fresh.propertyId },
        data: { status: 'UNDER_CONTRACT', agentId: fresh.agentId },
      })

      if (fresh.interestId) {
        await tx.propertyInterest.update({
          where: { id: fresh.interestId },
          data: { status: 'CONVERTED_TO_DEAL' },
        })
        const visit = await tx.siteVisit.findFirst({
          where: { interestId: fresh.interestId, dealId: null },
          orderBy: { createdAt: 'desc' },
        })
        if (visit) await tx.siteVisit.update({ where: { id: visit.id }, data: { dealId: deal.id } })
      }

      // A confirmed agreement supersedes any online offers still in flight.
      await tx.offer.updateMany({
        where: {
          propertyId: fresh.propertyId,
          status: { in: ['PENDING_REVIEW', 'PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      })

      await tx.offlineNegotiation.create({
        data: {
          dealId: deal.id,
          agreedAmount: fresh.proposedAmount,
          buyerConfirmed: true,
          sellerConfirmed: true,
          notes: `Agreed via ${fresh.channel.toLowerCase().replace('_', '-')} negotiation, confirmed by both parties.`,
          recordedById: fresh.agentId,
        },
      })
      await tx.negotiationEvent.create({
        data: {
          sessionId,
          actorId: userId,
          actorRole: role,
          eventType: 'AGREEMENT_REACHED',
          amount: fresh.proposedAmount,
          note: 'Deal created',
        },
      })
      await recordAudit(
        {
          action: 'DEAL_CREATED',
          actorId: userId,
          entity: 'Deal',
          entityId: deal.id,
          meta: { via: 'AGENT_ASSISTED_NEGOTIATION', sessionId, agreedPrice: fresh.proposedAmount },
        },
        tx
      )

      return deal.id
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      throw new Error('This property already has a deal in progress.')
    }
    throw err
  }

  await notifyUsers([
    {
      userId: negotiation.buyerId,
      title: 'Deal created',
      message: `Your purchase of ${negotiation.property.title} is confirmed. Paperwork begins now.`,
    },
    {
      userId: negotiation.sellerId,
      title: 'Deal created',
      message: `The sale of ${negotiation.property.title} is confirmed.`,
    },
  ])

  revalidateNegotiation(sessionId, negotiation.interestId)
  revalidatePath('/dashboard/accepted-offers')
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
}
