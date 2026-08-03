import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import { isTerminalInterestStatus } from '@/lib/data/interests'
import { siteVisitDTO } from '../route'

const VISIT_OUTCOMES = ['INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP_REQUIRED'] as const

/** Keeps the parent lead's status in step with its visit, so the operational
 *  queue reflects reality without staff updating two records by hand. Skipped
 *  for visits with no lead (the pre-interest backward-compatible path) and for
 *  leads that have already finished — a cancelled visit shouldn't drag a lead
 *  that's since converted to a deal back to CANCELLED. */
async function syncInterestStatus(interestId: string | null, status: string) {
  if (!interestId) return
  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    select: { status: true },
  })
  if (!interest || isTerminalInterestStatus(interest.status)) return
  await prisma.propertyInterest.update({ where: { id: interestId }, data: { status } })
}

/** Transition a site visit.
 *  AGENT (assigned): schedule (needs scheduledDate) | complete (optional feedback)
 *    | recordOutcome (INTERESTED | NOT_INTERESTED | FOLLOW_UP_REQUIRED, only once
 *    completed) | cancel.
 *  BUYER: cancel (own visits only) | dispute (only a SCHEDULED visit that
 *    staff booked directly, scheduledVia: 'AGREED_OFFLINE'). */
export const PATCH = withApi(async (req, { params }) => {
  const user = await authenticate(req, ['BUYER', 'AGENT'])
  const { id } = await params
  const body = await readJson<{
    action?: string
    scheduledDate?: string
    proposedDate?: string
    reason?: string
    feedback?: string
    outcome?: string
    interestedAmount?: number
  }>(req)
  const action = String(body.action ?? '')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new ApiError('Visit not found', 404)

  const isBuyerOwner = visit.buyerId === user.id
  const isAgentOwner = visit.agentId === user.id

  // ── Mutual date agreement ──
  // Either side can put a time forward; the other accepts, declines, or suggests
  // a different one. A booked visit dropping back to REQUESTED while a new time
  // is discussed is deliberate — nobody should be left believing the old slot
  // still stands.
  if (action === 'propose' || action === 'accept' || action === 'decline') {
    if (!isBuyerOwner && !isAgentOwner) throw new ApiError('Forbidden', 403)
    if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') {
      throw new ApiError('This visit is already closed', 400)
    }
    const side = isBuyerOwner ? 'BUYER' : 'AGENT'
    const otherPartyId = isBuyerOwner ? visit.agentId : visit.buyerId

    if (action === 'propose') {
      const proposedDate = new Date(String(body.proposedDate ?? body.scheduledDate ?? ''))
      if (Number.isNaN(proposedDate.getTime())) {
        throw new ApiError('proposedDate must be a valid date', 400)
      }
      const updated = await prisma.siteVisit.update({
        where: { id },
        data: { status: 'REQUESTED', proposedDate, proposedBy: side, scheduledDate: null },
      })
      await syncInterestStatus(visit.interestId, 'SITE_VISIT_REQUESTED')
      await recordAudit({
        action: 'SITE_VISIT_REQUESTED',
        actorId: user.id,
        entity: 'SiteVisit',
        entityId: id,
        meta: { proposedBy: side, proposedDate: proposedDate.toISOString() },
      })
      if (otherPartyId) {
        await notifyUsers([
          {
            userId: otherPartyId,
            title: 'New time proposed',
            message: `A new time for the visit to ${visit.property.title} has been proposed: ${proposedDate.toLocaleString('en-IN')}.`,
          },
        ])
      }
      return ok(siteVisitDTO(updated))
    }

    if (action === 'accept') {
      if (visit.status !== 'REQUESTED') throw new ApiError('This visit is not awaiting a decision', 400)
      if (!visit.proposedDate || !visit.proposedBy) {
        throw new ApiError('There is no proposed time to accept', 400)
      }
      // Accepting your own proposal would make the exchange decorative — one
      // side could book the other's diary by proposing and agreeing with itself.
      if (visit.proposedBy === side) {
        throw new ApiError('You proposed this time — the other party needs to accept it', 400)
      }
      const updated = await prisma.siteVisit.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          scheduledDate: visit.proposedDate,
          proposedDate: null,
          proposedBy: null,
        },
      })
      await syncInterestStatus(visit.interestId, 'SITE_VISIT_SCHEDULED')
      await recordAudit({
        action: 'SITE_VISIT_SCHEDULED',
        actorId: user.id,
        entity: 'SiteVisit',
        entityId: id,
        meta: { acceptedBy: side, scheduledDate: visit.proposedDate.toISOString() },
      })
      if (otherPartyId) {
        await notifyUsers([
          {
            userId: otherPartyId,
            title: 'Site visit confirmed',
            message: `The visit to ${visit.property.title} is confirmed for ${visit.proposedDate.toLocaleString('en-IN')}.`,
          },
        ])
      }
      return ok(siteVisitDTO(updated))
    }

    // decline — "not happening", as distinct from "not then"
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    const updated = await prisma.siteVisit.update({
      where: { id },
      data: { status: 'CANCELLED', proposedDate: null, proposedBy: null, feedback: reason ?? visit.feedback },
    })
    await recordAudit({
      action: 'SITE_VISIT_CANCELLED',
      actorId: user.id,
      entity: 'SiteVisit',
      entityId: id,
      meta: { declinedBy: side, reason },
    })
    if (otherPartyId) {
      await notifyUsers([
        {
          userId: otherPartyId,
          title: 'Site visit declined',
          message: `The visit to ${visit.property.title} won't be going ahead.${reason ? ` Reason: ${reason}` : ''}`,
        },
      ])
    }
    return ok(siteVisitDTO(updated))
  }

  if (action === 'cancel') {
    if (!isBuyerOwner && !isAgentOwner) throw new ApiError('Forbidden', 403)
    if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') throw new ApiError('Visit already closed', 400)
    const updated = await prisma.siteVisit.update({ where: { id }, data: { status: 'CANCELLED' } })
    await syncInterestStatus(visit.interestId, 'CANCELLED')
    await recordAudit({
      action: 'SITE_VISIT_CANCELLED',
      actorId: user.id,
      entity: 'SiteVisit',
      entityId: id,
      meta: { cancelledBy: isBuyerOwner ? 'BUYER' : 'AGENT' },
    })
    const notifyId = isBuyerOwner ? visit.agentId : visit.buyerId
    if (notifyId) {
      await notifyUsers([{ userId: notifyId, title: 'Site visit cancelled', message: `The visit to ${visit.property.title} was cancelled.` }])
    }
    return ok(siteVisitDTO(updated))
  }

  // Buyer disputes a visit staff booked directly from a phone call
  // (scheduledVia: 'AGREED_OFFLINE') rather than proposing and waiting for
  // in-app acceptance. Reverts the visit to a proposal, keeping the date, so
  // neither side restarts from scratch.
  if (action === 'dispute') {
    if (!isBuyerOwner) throw new ApiError('Forbidden — buyers only', 403)
    if (visit.status !== 'SCHEDULED') throw new ApiError('Only a scheduled visit can be disputed', 400)
    if (visit.scheduledVia !== 'AGREED_OFFLINE') {
      throw new ApiError('This visit was booked through the app — decline or propose a new time instead', 400)
    }
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    const updated = await prisma.siteVisit.update({
      where: { id },
      data: {
        status: 'REQUESTED',
        proposedDate: visit.scheduledDate,
        proposedBy: 'BUYER',
        scheduledDate: null,
        disputedAt: new Date(),
        disputedNote: reason,
      },
    })
    await syncInterestStatus(visit.interestId, 'SITE_VISIT_REQUESTED')
    await recordAudit({
      action: 'SITE_VISIT_DISPUTED',
      actorId: user.id,
      entity: 'SiteVisit',
      entityId: id,
      meta: { reason },
    })
    if (visit.agentId) {
      await notifyUsers([
        {
          userId: visit.agentId,
          title: 'Site visit disputed',
          message: `The buyer says the booked time for ${visit.property.title} doesn't work.${reason ? ` Reason: ${reason}` : ''}`,
        },
      ])
    }
    return ok(siteVisitDTO(updated))
  }

  // Remaining actions are agent-only.
  if (!isAgentOwner) throw new ApiError('Forbidden — agents only', 403)

  if (action === 'schedule') {
    const scheduledDate = new Date(String(body.scheduledDate ?? ''))
    if (Number.isNaN(scheduledDate.getTime())) throw new ApiError('scheduledDate must be a valid date', 400)
    const updated = await prisma.siteVisit.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledDate, agentId: user.id },
    })
    await syncInterestStatus(visit.interestId, 'SITE_VISIT_SCHEDULED')
    await recordAudit({
      action: 'SITE_VISIT_SCHEDULED',
      actorId: user.id,
      entity: 'SiteVisit',
      entityId: id,
      meta: { scheduledDate: scheduledDate.toISOString() },
    })
    await notifyUsers([{ userId: visit.buyerId, title: 'Site visit scheduled', message: `Your visit to ${visit.property.title} is confirmed.` }])
    return ok(siteVisitDTO(updated))
  }

  if (action === 'complete') {
    const feedback = typeof body.feedback === 'string' && body.feedback.trim() ? body.feedback.trim() : null
    const updated = await prisma.siteVisit.update({ where: { id }, data: { status: 'COMPLETED', feedback } })
    await syncInterestStatus(visit.interestId, 'SITE_VISIT_COMPLETED')
    await recordAudit({ action: 'SITE_VISIT_COMPLETED', actorId: user.id, entity: 'SiteVisit', entityId: id })
    await notifyUsers([{ userId: visit.buyerId, title: 'Site visit completed', message: `Your visit to ${visit.property.title} was marked complete.` }])
    return ok(siteVisitDTO(updated))
  }

  // ── Post-visit outcome ──
  // Only after the visit actually happened: an outcome on a visit that was never
  // conducted would be a fabricated record of a conversation.
  if (action === 'recordOutcome') {
    if (visit.status !== 'COMPLETED') {
      throw new ApiError('Mark the visit completed before recording its outcome', 400)
    }
    const outcome = String(body.outcome || '').trim().toUpperCase()
    if (!VISIT_OUTCOMES.includes(outcome as (typeof VISIT_OUTCOMES)[number])) {
      throw new ApiError(`outcome must be one of: ${VISIT_OUTCOMES.join(', ')}`, 400)
    }
    const interestedAmount = body.interestedAmount != null ? Number(body.interestedAmount) : null
    if (interestedAmount != null && (!Number.isFinite(interestedAmount) || interestedAmount <= 0)) {
      throw new ApiError('interestedAmount must be a positive number', 400)
    }
    // Recording that the buyer is interested does NOT create a deal — it opens
    // the door to a negotiation, which both parties must then confirm.
    const updated = await prisma.siteVisit.update({
      where: { id },
      data: {
        outcome,
        interestedAmount,
        feedback: typeof body.feedback === 'string' && body.feedback.trim() ? body.feedback.trim() : visit.feedback,
      },
    })
    await syncInterestStatus(
      visit.interestId,
      outcome === 'INTERESTED' ? 'INTERESTED' : outcome === 'NOT_INTERESTED' ? 'NOT_INTERESTED' : 'SITE_VISIT_COMPLETED'
    )
    await recordAudit({
      action: 'SITE_VISIT_OUTCOME_RECORDED',
      actorId: user.id,
      entity: 'SiteVisit',
      entityId: id,
      meta: { outcome, interestedAmount },
    })
    return ok(siteVisitDTO(updated))
  }

  throw new ApiError('Unknown action — expected schedule, complete, cancel, dispute, or recordOutcome', 400)
})
