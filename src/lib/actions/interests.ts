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
