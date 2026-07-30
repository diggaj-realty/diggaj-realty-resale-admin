'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import {
  assignInterestAgent,
  isTerminalInterestStatus,
  INTEREST_STATUSES,
  type InterestStatus,
} from '@/lib/data/interests'
import { isLeadLossReason, lossEndsBuyerInterest } from '@/lib/visitOutcomes'

/** Dashboard-side lead operations. Thin wrappers over the shared domain logic in
 *  src/lib/data/interests.ts, so the internal dashboard and the public API can't
 *  drift on who's allowed to do what. */

/** The assigned agent, or backend/admin. */
async function requireLeadStaff(interestId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { title: true } } },
  })
  if (!interest) throw new Error('Lead not found')

  const { id: userId, role } = session.user
  const isAssignedAgent = role === 'AGENT' && interest.agentId === userId
  const isStaff = role === 'BACKEND' || role === 'ADMIN'
  if (!isAssignedAgent && !isStaff) throw new Error('Unauthorized')

  return { interest, userId, role, isStaff }
}

function revalidateLead(interestId: string) {
  revalidatePath(`/dashboard/leads/${interestId}`)
  revalidatePath('/dashboard/leads')
  revalidatePath('/dashboard')
}

export async function assignLeadAgent(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN') {
    throw new Error('Only backend or admin can assign an agent to a lead')
  }

  const interestId = String(formData.get('interestId'))
  const agentId = String(formData.get('agentId'))
  if (!interestId || !agentId) throw new Error('Lead and agent are required')

  const result = await assignInterestAgent({ interestId, agentId, actorId: session.user.id })
  if ('error' in result) {
    throw new Error(result.error === 'INVALID_AGENT' ? 'Invalid agent' : 'Lead not found')
  }

  revalidateLead(interestId)
}

/** An agent taking an unassigned lead for themselves.
 *
 *  Assignment used to be push-only — staff had to hand a lead over, so an agent
 *  looking at the unassigned queue could see work they were willing to do and had
 *  no way to take it. Restricted to leads nobody owns: claiming someone else's is
 *  a reassignment, which stays a staff decision. */
export async function claimLead(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'AGENT') throw new Error('Only an agent can claim a lead')

  const interestId = String(formData.get('interestId'))
  if (!interestId) throw new Error('Lead is required')

  const lead = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    select: { agentId: true },
  })
  if (!lead) throw new Error('Lead not found')
  if (lead.agentId) throw new Error('This lead is already assigned')

  const result = await assignInterestAgent({ interestId, agentId: session.user.id, actorId: session.user.id })
  if ('error' in result) {
    throw new Error(result.error === 'INVALID_AGENT' ? 'Your account cannot take leads' : 'Lead not found')
  }

  revalidateLead(interestId)
}

/** Advances a lead's operational status.
 *
 *  CONVERTED_TO_DEAL is excluded — that's a consequence of a deal actually being
 *  created, not a label to apply by hand, otherwise a lead could claim a deal
 *  that doesn't exist. */
export async function updateLeadStatus(formData: FormData) {
  const interestId = String(formData.get('interestId'))
  const status = String(formData.get('status') || '').toUpperCase()

  if (!INTEREST_STATUSES.includes(status as InterestStatus)) throw new Error('Invalid status')
  if (status === 'CONVERTED_TO_DEAL') {
    throw new Error('This status is set automatically when a deal is created')
  }

  const { interest, userId } = await requireLeadStaff(interestId)
  if (interest.status === status) return

  await prisma.propertyInterest.update({ where: { id: interestId }, data: { status } })

  await recordAudit({
    action: 'INTEREST_STATUS_CHANGED',
    actorId: userId,
    entity: 'PropertyInterest',
    entityId: interestId,
    meta: { from: interest.status, to: status },
  })

  // Only tell the buyer when the lead reaches an outcome they'd care about; the
  // intermediate operational states are internal noise to them.
  if (isTerminalInterestStatus(status)) {
    await notifyUsers([
      {
        userId: interest.buyerId,
        title: status === 'NOT_INTERESTED' ? 'Enquiry closed' : 'Enquiry updated',
        message: `Your enquiry about ${interest.property.title} has been closed.`,
      },
    ])
  }

  revalidateLead(interestId)
}

/** Closes a lead as lost, with a reason.
 *
 *  Closing used to mean setting NOT_INTERESTED through updateLeadStatus, which
 *  left the lead looking open in the queue and recorded nothing about why it died.
 *  The reason is mandatory: these codes are the only why-we-lose data the platform
 *  gets, and an optional field on a form nobody has time for would stay empty.
 *
 *  Whether the buyer is done with *this property* or with buying altogether is
 *  recorded too. "Price too high" leaves a buyer worth showing other listings, and
 *  treating them as gone throws away a warm lead. When a reason does mean they are
 *  out, their other live leads on this platform are closed with them rather than
 *  being left for other agents to chase someone who has already bought. */
export async function closeLead(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || !['AGENT', 'BACKEND', 'ADMIN'].includes(session.user.role)) throw new Error('Unauthorized')

  const interestId = String(formData.get('interestId') ?? '')
  const reason = String(formData.get('lossReason') ?? '')
  const note = String(formData.get('lossNote') ?? '').trim() || null
  if (!interestId) throw new Error('Lead is required')
  if (!isLeadLossReason(reason)) throw new Error('Select why this lead is being closed')

  const lead = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { title: true } } },
  })
  if (!lead) throw new Error('Lead not found')

  const isStaff = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isStaff && lead.agentId !== session.user.id) throw new Error('This lead is assigned to another agent')
  if (lead.status === 'CONVERTED_TO_DEAL') throw new Error('This lead became a deal and cannot be closed as lost')
  if (lead.closedAt) throw new Error('This lead is already closed')

  const endsBuyer = lossEndsBuyerInterest(reason)

  await prisma.$transaction(async (tx) => {
    await tx.propertyInterest.update({
      where: { id: interestId },
      data: {
        status: 'CLOSED',
        lossReason: reason,
        lossNote: note,
        closedAt: new Date(),
        closedById: session.user.id,
      },
    })

    if (endsBuyer) {
      await tx.propertyInterest.updateMany({
        where: {
          buyerId: lead.buyerId,
          id: { not: interestId },
          status: { notIn: ['CONVERTED_TO_DEAL', 'CLOSED', 'CANCELLED', 'NOT_INTERESTED'] },
        },
        data: {
          status: 'CLOSED',
          lossReason: reason,
          lossNote: note ? `${note} (closed with the buyer's other leads)` : "Closed with the buyer's other leads",
          closedAt: new Date(),
          closedById: session.user.id,
        },
      })
    }
  })

  await recordAudit({
    action: 'LEAD_CLOSED',
    actorId: session.user.id,
    entity: 'PropertyInterest',
    entityId: interestId,
    meta: { lossReason: reason, lossNote: note, endsBuyerInterest: endsBuyer, by: session.user.role },
  })

  revalidateLead(interestId)
}
