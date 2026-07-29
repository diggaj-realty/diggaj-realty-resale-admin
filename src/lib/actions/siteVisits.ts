'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import { isTerminalInterestStatus } from '@/lib/data/interests'
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp'
import {
  isVisitOutcome,
  outcomeNeedsAmount,
  outcomeMeansVisitDidNotHappen,
  leadStatusForOutcome,
} from '@/lib/visitOutcomes'

async function requireRole(...roles: string[]) {
  const session = await getServerSession(authOptions)
  if (!session || !roles.includes(session.user.role)) throw new Error('Unauthorized')
  return session
}

function parseDate(value: FormDataEntryValue | null, label: string): Date {
  const d = new Date(String(value ?? ''))
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`)
  return d
}

function revalidate() {
  revalidatePath('/dashboard/site-visits')
  revalidatePath('/dashboard')
}

/** Buyer requests a site visit. Auto-routes to the property's assigned agent (if
 *  any) so it lands in that agent's queue. Blocked when the platform toggle is off. */
export async function requestSiteVisit(formData: FormData) {
  const session = await requireRole('BUYER')

  const config = await prisma.appConfig.findFirst({ select: { siteVisitsEnabled: true } })
  if (config && config.siteVisitsEnabled === false) throw new Error('Site visits are currently disabled')

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) throw new Error('Missing propertyId')
  const requestedDate = parseDate(formData.get('requestedDate'), 'date')
  const buyerNote = String(formData.get('buyerNote') ?? '').trim() || null

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { title: true, agentId: true },
  })
  if (!property) throw new Error('Property not found')

  await prisma.siteVisit.create({
    data: {
      propertyId,
      buyerId: session.user.id,
      agentId: property.agentId,
      requestedDate,
      buyerNote,
      status: 'REQUESTED',
    },
  })

  if (property.agentId) {
    await notifyUsers([
      {
        userId: property.agentId,
        title: 'New site-visit request',
        message: `${session.user.name} requested a visit to ${property.title}.`,
      },
    ])
  }

  revalidate()
}

/** Agent schedules a REQUESTED visit — claims it and sets the confirmed date. */
/** Agent confirms a date outright, booking the visit.
 *
 *  Use this when the buyer's requested slot works, or when the buyer has already
 *  proposed a time and the agent is accepting it. If the agent wants a *different*
 *  time than the buyer asked for, `proposeSiteVisitDate` is the honest action —
 *  it asks rather than tells. */
export async function scheduleSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT', 'BACKEND', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const scheduledDate = parseDate(formData.get('scheduledDate'), 'date')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  // Backend and admin run the desk and were previously locked out of scheduling
  // altogether, which meant an agent on leave stalled every visit they owned.
  const isStaff = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isStaff && visit.agentId && visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.status !== 'REQUESTED') throw new Error('Only a requested visit can be scheduled')

  // Confirming the buyer's own proposed date records their consent directly.
  // Anything else is staff asserting a slot the buyer agreed to verbally.
  const via =
    visit.proposedBy === 'BUYER' && visit.proposedDate?.getTime() === scheduledDate.getTime()
      ? 'BUYER_ACCEPTED'
      : 'AGREED_OFFLINE'

  await prisma.siteVisit.update({
    where: { id },
    // Clear any open proposal — a booked date shouldn't sit next to a stale
    // "awaiting a reply" one.
    data: {
      status: 'SCHEDULED',
      scheduledDate,
      agentId: visit.agentId ?? (isStaff ? null : session.user.id),
      proposedDate: null,
      proposedBy: null,
      scheduledVia: via,
      scheduledById: via === 'AGREED_OFFLINE' ? session.user.id : null,
      disputedAt: null,
      disputedNote: null,
    },
  })

  await syncInterest(visit.interestId, 'SITE_VISIT_SCHEDULED')
  await recordAudit({
    action: 'SITE_VISIT_SCHEDULED',
    actorId: session.user.id,
    entity: 'SiteVisit',
    entityId: id,
    meta: { scheduledDate: scheduledDate.toISOString() },
  })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: 'Site visit scheduled',
      message:
        via === 'AGREED_OFFLINE'
          ? `Your visit to ${visit.property.title} is booked for ${scheduledDate.toLocaleString('en-IN')}, as agreed on your call. Tell us if that is wrong.`
          : `Your visit to ${visit.property.title} is confirmed for ${scheduledDate.toLocaleString('en-IN')}.`,
    },
  ])

  revalidate()
}

/** Books a visit straight from a phone call, with no proposal step.
 *
 *  agentProposeSiteVisit puts a time forward and waits for the buyer to accept in
 *  the app, which is right when nobody has spoken. It is wrong after a call where
 *  the slot was already agreed: the agent then has to ask the buyer to confirm
 *  something they just confirmed out loud, and the visit sits unbooked until they
 *  get round to it.
 *
 *  Recorded as AGREED_OFFLINE with the staff member who booked it, and the buyer
 *  is told it was booked on their behalf and given a way to dispute it. That
 *  distinction is the whole safeguard — without it this is merely a way to put
 *  things in someone else's diary. */
export async function bookAgreedSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT', 'BACKEND', 'ADMIN')
  const interestId = String(formData.get('interestId') ?? '')
  if (!interestId) throw new Error('Missing lead')
  const scheduledDate = parseDate(formData.get('scheduledDate'), 'date')
  const note = String(formData.get('note') ?? '').trim() || null

  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { id: true, title: true, status: true } } },
  })
  if (!interest) throw new Error('Lead not found')

  const isStaff = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isStaff && interest.agentId !== session.user.id) throw new Error('This lead is assigned to another agent')
  if (interest.property.status !== 'LIVE') throw new Error('This property is no longer available to visit')

  const open = await prisma.siteVisit.findFirst({
    where: { interestId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
  })
  if (open) throw new Error('This lead already has a visit in progress')

  const visit = await prisma.siteVisit.create({
    data: {
      propertyId: interest.propertyId,
      buyerId: interest.buyerId,
      agentId: interest.agentId ?? (isStaff ? null : session.user.id),
      interestId,
      status: 'SCHEDULED',
      requestedDate: scheduledDate,
      scheduledDate,
      buyerNote: note,
      scheduledVia: 'AGREED_OFFLINE',
      scheduledById: session.user.id,
    },
  })

  await syncInterest(interestId, 'SITE_VISIT_SCHEDULED')
  await recordAudit({
    action: 'SITE_VISIT_SCHEDULED',
    actorId: session.user.id,
    entity: 'SiteVisit',
    entityId: visit.id,
    meta: { via: 'AGREED_OFFLINE', scheduledDate: scheduledDate.toISOString(), interestId },
  })

  await notifyUsers([
    {
      userId: interest.buyerId,
      title: 'Site visit booked',
      message: `Your visit to ${interest.property.title} is booked for ${scheduledDate.toLocaleString('en-IN')}, as agreed on your call. Tell us if that is wrong.`,
      // Booked on their behalf, so this has to reach them somewhere they will see
      // it before the day — an in-app row they never open is not good enough for a
      // date somebody else put in their diary.
      whatsapp: {
        template: WHATSAPP_TEMPLATES.VISIT_BOOKED,
        variables: [interest.property.title, scheduledDate.toLocaleString('en-IN')],
      },
    },
  ])

  revalidate()
  revalidatePath(`/dashboard/leads/${interestId}`)
}

/** The buyer saying a staff-booked slot is not what they agreed.
 *
 *  Sends the visit back to being a proposal rather than leaving a date in place
 *  the buyer has rejected. Only available on AGREED_OFFLINE bookings — a date the
 *  buyer accepted themselves is rescheduled, not disputed. */
export async function disputeScheduledSiteVisit(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const id = String(formData.get('id') ?? '')
  const note = String(formData.get('note') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.buyerId !== session.user.id) throw new Error('Only the buyer can dispute their own visit')
  if (visit.status !== 'SCHEDULED') throw new Error('This visit is not currently booked')
  if (visit.scheduledVia !== 'AGREED_OFFLINE') {
    throw new Error('You confirmed this slot yourself — propose a different time instead')
  }

  await prisma.siteVisit.update({
    where: { id },
    data: {
      status: 'REQUESTED',
      // The booked date becomes a proposal again, attributed to whoever put it
      // forward, so the buyer can accept or counter rather than starting over.
      proposedDate: visit.scheduledDate,
      proposedBy: 'AGENT',
      scheduledDate: null,
      scheduledVia: null,
      disputedAt: new Date(),
      disputedNote: note,
    },
  })

  await syncInterest(visit.interestId, 'SITE_VISIT_REQUESTED')
  await recordAudit({
    action: 'SITE_VISIT_DISPUTED',
    actorId: session.user.id,
    entity: 'SiteVisit',
    entityId: id,
    meta: { note, wasScheduledFor: visit.scheduledDate?.toISOString() ?? null },
  })

  const staff = await prisma.user.findMany({ where: { role: 'BACKEND', isActive: true }, select: { id: true } })
  await notifyUsers(
    [...(visit.agentId ? [visit.agentId] : []), ...staff.map((x) => x.id)].map((userId) => ({
      userId,
      title: 'Buyer disputed a booked visit',
      message: `The buyer says the slot booked for ${visit.property.title} is not what they agreed.${note ? ` "${note}"` : ''}`,
    }))
  )

  revalidate()
}

/** Keeps the parent lead in step, skipping leads that have already finished. */
async function syncInterest(interestId: string | null, status: string) {
  if (!interestId) return
  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    select: { status: true },
  })
  if (!interest || isTerminalInterestStatus(interest.status)) return
  await prisma.propertyInterest.update({ where: { id: interestId }, data: { status } })
}

/** Agent creates a visit off their own bat, for a buyer they're already working.
 *
 *  Until now only a buyer could start a visit, which meant an agent who'd just
 *  got off the phone had no way to put a slot forward. The visit opens with a
 *  proposed date awaiting the buyer's agreement rather than a booked one — the
 *  agent is offering a time, not imposing one on someone's diary. */
export async function agentProposeSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT')
  const interestId = String(formData.get('interestId') ?? '')
  if (!interestId) throw new Error('Missing lead')
  const proposedDate = parseDate(formData.get('proposedDate'), 'date')
  const note = String(formData.get('note') ?? '').trim() || null

  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { id: true, title: true, status: true } }, buyer: { select: { name: true } } },
  })
  if (!interest) throw new Error('Lead not found')
  if (interest.agentId !== session.user.id) throw new Error('This lead is assigned to another agent')
  if (interest.property.status !== 'LIVE') throw new Error('This property is no longer available to visit')

  // One live visit per lead — two open invitations for the same buyer and
  // property would just confuse everyone about which slot is real.
  const open = await prisma.siteVisit.findFirst({
    where: { interestId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
  })
  if (open) throw new Error('This lead already has a visit in progress')

  const visit = await prisma.siteVisit.create({
    data: {
      propertyId: interest.propertyId,
      buyerId: interest.buyerId,
      agentId: session.user.id,
      interestId,
      status: 'REQUESTED',
      // requestedDate is the buyer's ask elsewhere; here the agent is the one
      // asking, so it mirrors the proposal.
      requestedDate: proposedDate,
      proposedDate,
      proposedBy: 'AGENT',
      buyerNote: note,
    },
  })

  await syncInterest(interestId, 'SITE_VISIT_REQUESTED')
  await recordAudit({
    action: 'SITE_VISIT_REQUESTED',
    actorId: session.user.id,
    entity: 'SiteVisit',
    entityId: visit.id,
    meta: { proposedBy: 'AGENT', proposedDate: proposedDate.toISOString(), interestId },
  })

  await notifyUsers([
    {
      userId: interest.buyerId,
      title: 'Site visit proposed',
      message: `Your agent has proposed a visit to ${interest.property.title} on ${proposedDate.toLocaleString('en-IN')}. Accept, decline, or suggest another time.`,
    },
  ])

  revalidate()
  revalidatePath(`/dashboard/leads/${interestId}`)
}

/** Puts a different date forward, from either side.
 *
 *  This is the "reschedule" path and it's deliberately symmetric: whoever
 *  proposes hands the decision to the other party rather than moving a confirmed
 *  booking unilaterally. A visit already scheduled drops back to REQUESTED while
 *  the new time is under discussion, so nobody is left believing the old slot
 *  still stands. */
export async function proposeSiteVisitDate(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const proposedDate = parseDate(formData.get('proposedDate'), 'date')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') {
    throw new Error('This visit is already closed')
  }

  const { id: userId, role } = session.user
  const isAgentSide = visit.agentId === userId || role === 'BACKEND' || role === 'ADMIN'
  const isBuyer = visit.buyerId === userId
  if (!isAgentSide && !isBuyer) throw new Error('Unauthorized')
  const proposedBy = isBuyer ? 'BUYER' : 'AGENT'

  // A reschedule agreed on a call needs the same treatment as a first booking:
  // otherwise moving a date the buyer already agreed to verbally drops the visit
  // back into "awaiting a reply" and the agent has to chase a confirmation they
  // already have. Staff-only — a buyer proposing a time is always a proposal.
  const agreedOffline = isAgentSide && String(formData.get('agreedOffline') ?? '') === 'true'

  await prisma.siteVisit.update({
    where: { id },
    data: agreedOffline
      ? {
          status: 'SCHEDULED',
          scheduledDate: proposedDate,
          proposedDate: null,
          proposedBy: null,
          scheduledVia: 'AGREED_OFFLINE',
          scheduledById: userId,
          disputedAt: null,
          disputedNote: null,
        }
      : {
          status: 'REQUESTED',
          proposedDate,
          proposedBy,
          // The old booking is no longer agreed once someone asks to move it.
          scheduledDate: null,
          scheduledVia: null,
        },
  })

  await syncInterest(visit.interestId, agreedOffline ? 'SITE_VISIT_SCHEDULED' : 'SITE_VISIT_REQUESTED')
  await recordAudit({
    action: agreedOffline ? 'SITE_VISIT_SCHEDULED' : 'SITE_VISIT_REQUESTED',
    actorId: userId,
    entity: 'SiteVisit',
    entityId: id,
    meta: {
      proposedBy,
      proposedDate: proposedDate.toISOString(),
      reschedule: true,
      ...(agreedOffline ? { via: 'AGREED_OFFLINE' } : {}),
    },
  })

  const recipient = isBuyer ? visit.agentId : visit.buyerId
  if (recipient) {
    await notifyUsers([
      {
        userId: recipient,
        title: agreedOffline ? 'Visit moved' : 'New time proposed',
        message: agreedOffline
          ? `The visit to ${visit.property.title} has been moved to ${proposedDate.toLocaleString('en-IN')}, as agreed on your call. Tell us if that is wrong.`
          : `A new time for the visit to ${visit.property.title} has been proposed: ${proposedDate.toLocaleString('en-IN')}.`,
      },
    ])
  }

  revalidate()
  if (visit.interestId) revalidatePath(`/dashboard/leads/${visit.interestId}`)
}

/** Accepts the date the other side proposed, booking the visit.
 *
 *  Guarded so you can't accept your own proposal — that would make the whole
 *  back-and-forth decorative, letting one side book the other's diary by
 *  proposing and immediately agreeing with itself. */
export async function acceptSiteVisitProposal(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.status !== 'REQUESTED') throw new Error('This visit is not awaiting a decision')
  if (!visit.proposedDate || !visit.proposedBy) throw new Error('There is no proposed time to accept')

  const { id: userId, role } = session.user
  const isAgentSide = visit.agentId === userId || role === 'BACKEND' || role === 'ADMIN'
  const isBuyer = visit.buyerId === userId
  if (!isAgentSide && !isBuyer) throw new Error('Unauthorized')

  const side = isBuyer ? 'BUYER' : 'AGENT'
  if (visit.proposedBy === side) {
    throw new Error('You proposed this time — the other party needs to accept it')
  }

  await prisma.siteVisit.update({
    where: { id },
    data: {
      status: 'SCHEDULED',
      scheduledDate: visit.proposedDate,
      proposedDate: null,
      proposedBy: null,
      // An agent accepting a buyer's proposal also claims the visit, so it's
      // clear who's turning up.
      ...(isAgentSide && !visit.agentId && role === 'AGENT' ? { agentId: userId } : {}),
    },
  })

  await syncInterest(visit.interestId, 'SITE_VISIT_SCHEDULED')
  await recordAudit({
    action: 'SITE_VISIT_SCHEDULED',
    actorId: userId,
    entity: 'SiteVisit',
    entityId: id,
    meta: { acceptedBy: side, scheduledDate: visit.proposedDate.toISOString() },
  })

  const recipients = [visit.buyerId, visit.agentId].filter((uid): uid is string => !!uid && uid !== userId)
  await notifyUsers(
    recipients.map((uid) => ({
      userId: uid,
      title: 'Site visit confirmed',
      message: `The visit to ${visit.property.title} is confirmed for ${visit.proposedDate!.toLocaleString('en-IN')}.`,
    }))
  )

  revalidate()
  if (visit.interestId) revalidatePath(`/dashboard/leads/${visit.interestId}`)
}

/** Declines the proposed time outright, cancelling the visit.
 *
 *  Distinct from proposing a different date: this is "not happening", not "not
 *  then". Either side can do it, and a fresh visit is created if things restart —
 *  so the declined attempt stays on record. */
export async function declineSiteVisitProposal(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const reason = String(formData.get('reason') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') {
    throw new Error('This visit is already closed')
  }

  const { id: userId, role } = session.user
  const isAgentSide = visit.agentId === userId || role === 'BACKEND' || role === 'ADMIN'
  const isBuyer = visit.buyerId === userId
  if (!isAgentSide && !isBuyer) throw new Error('Unauthorized')

  await prisma.siteVisit.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      proposedDate: null,
      proposedBy: null,
      feedback: reason ?? visit.feedback,
    },
  })

  await syncInterest(visit.interestId, 'CANCELLED')
  await recordAudit({
    action: 'SITE_VISIT_CANCELLED',
    actorId: userId,
    entity: 'SiteVisit',
    entityId: id,
    meta: { declinedBy: isBuyer ? 'BUYER' : 'AGENT', reason },
  })

  const recipients = [visit.buyerId, visit.agentId].filter((uid): uid is string => !!uid && uid !== userId)
  await notifyUsers(
    recipients.map((uid) => ({
      userId: uid,
      title: 'Site visit declined',
      message: `The visit to ${visit.property.title} won't be going ahead.${reason ? ` Reason: ${reason}` : ''}`,
    }))
  )

  revalidate()
  if (visit.interestId) revalidatePath(`/dashboard/leads/${visit.interestId}`)
}

/** Agent marks a visit COMPLETED and records post-visit feedback. */
export async function completeSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT', 'BACKEND', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const feedback = String(formData.get('feedback') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  const isStaff = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isStaff && visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.status !== 'SCHEDULED') throw new Error('Only a scheduled visit can be marked complete')

  await prisma.siteVisit.update({ where: { id }, data: { status: 'COMPLETED', feedback } })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: 'Site visit completed',
      message: `Your visit to ${visit.property.title} was marked complete.`,
    },
  ])

  revalidate()
}

/** Records what happened at the visit, and completes it in the same step.
 *
 *  Completing and recording used to be two actions, with the outcome refused
 *  until the visit was already marked COMPLETED. An agent walking out of a flat
 *  wants one form: what happened, at what price, what next — so this marks the
 *  visit complete itself when it is still SCHEDULED.
 *
 *  Callable repeatedly right up until a Deal is created from this visit, since
 *  further in-person rounds can change the figure. Open to backend and admin as
 *  well as the owning agent: an agent who leaves or goes on holiday used to make
 *  their visits impossible to close out, and the desk could not correct a mistake.
 */
export async function recordSiteVisitOutcome(formData: FormData) {
  const session = await requireRole('AGENT', 'BACKEND', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const outcome = String(formData.get('outcome') ?? '')
  if (!isVisitOutcome(outcome)) throw new Error('Invalid outcome')
  const feedback = String(formData.get('feedback') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true, askingPrice: true } } },
  })
  if (!visit) throw new Error('Visit not found')

  const isStaff = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isStaff && visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.status === 'CANCELLED') throw new Error('This visit was cancelled')
  if (visit.dealId) throw new Error('A deal has already been created from this visit')

  const amountRaw = formData.get('interestedAmount')
  const interestedAmount = outcomeNeedsAmount(outcome)
    ? amountRaw && String(amountRaw).trim()
      ? Number(amountRaw)
      : (visit.interestedAmount ?? visit.property.askingPrice)
    : null

  if (outcomeNeedsAmount(outcome) && (!interestedAmount || interestedAmount <= 0)) {
    throw new Error('Enter a valid amount')
  }

  await prisma.siteVisit.update({
    where: { id },
    data: {
      outcome,
      interestedAmount,
      // One step: a visit still on the calendar is closed out by recording what
      // happened at it. A no-show is still a completed visit slot — the outcome
      // is what says nothing happened, and leaving it SCHEDULED would keep it in
      // the upcoming-visits list forever.
      ...(visit.status === 'SCHEDULED' || visit.status === 'REQUESTED' ? { status: 'COMPLETED' } : {}),
      ...(feedback ? { feedback } : {}),
    },
  })

  // Keep the parent lead in step, unless it has already finished. A no-show says
  // nothing about the buyer's intent, so leadStatusForOutcome returns null and the
  // lead stays where it was rather than drifting out of the follow-up queue.
  const nextLeadStatus = leadStatusForOutcome(outcome)
  if (visit.interestId && nextLeadStatus) {
    const interest = await prisma.propertyInterest.findUnique({
      where: { id: visit.interestId },
      select: { status: true },
    })
    if (interest && !isTerminalInterestStatus(interest.status)) {
      await prisma.propertyInterest.update({
        where: { id: visit.interestId },
        data: { status: nextLeadStatus },
      })
    }
  }

  await recordAudit({
    action: 'SITE_VISIT_OUTCOME_RECORDED',
    actorId: session.user.id,
    entity: 'SiteVisit',
    entityId: id,
    meta: { outcome, interestedAmount, interestId: visit.interestId, by: session.user.role },
  })

  // A no-show or failed visit is an internal operations note, not news for the
  // buyer — telling them "your visit was recorded as you not turning up" invites
  // an argument the platform cannot settle. Staff follow up by phone instead.
  if (!outcomeMeansVisitDidNotHappen(outcome)) {
    await notifyUsers([
      {
        userId: visit.buyerId,
        title: outcome === 'NOT_INTERESTED' ? 'Visit outcome recorded' : 'Thanks for visiting',
        message:
          outcome === 'INTERESTED'
            ? `Your interest in ${visit.property.title} has been noted — paperwork can begin once the price is finalised.`
            : outcome === 'NEGOTIATING'
              ? `We have recorded that you are still discussing price on ${visit.property.title}.`
              : outcome === 'REVISIT_REQUESTED'
                ? `We will arrange another visit to ${visit.property.title}.`
                : outcome === 'NOT_INTERESTED'
                  ? `Your visit to ${visit.property.title} has been closed out.`
                  : `Your agent will follow up with you about ${visit.property.title}.`,
      },
    ])
  }

  revalidate()
  revalidatePath('/dashboard/site-visits-queue')
  if (visit.interestId) revalidatePath(`/dashboard/leads/${visit.interestId}`)
}

/** Agent (or staff) creates the Deal directly once a price is agreed —
 *  skips the online offer/counter-offer flow entirely, since the negotiation
 *  already happened in person during the visit. Locks the property out of
 *  search/new offers the same as the online-offer path (finalizeAcceptance
 *  in src/lib/actions/offers.ts) — same guard against double-selling. */
export async function createDealFromSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT', 'BACKEND', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { id: true, title: true, sellerId: true, agentId: true, status: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (session.user.role === 'AGENT' && visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.outcome !== 'INTERESTED' || !visit.interestedAmount) throw new Error('Record an interested outcome with an amount first')
  if (visit.dealId) throw new Error('A deal has already been created from this visit')
  if (visit.property.status !== 'LIVE') {
    throw new Error('This property is no longer live — it may already be under contract with another buyer.')
  }
  const existingDeal = await prisma.deal.findUnique({ where: { activePropertyId: visit.property.id } })
  if (existingDeal) throw new Error('This property already has a deal in progress.')

  const deal = await prisma.deal.create({
    data: {
      propertyId: visit.property.id,
      activePropertyId: visit.property.id,
      buyerId: visit.buyerId,
      sellerId: visit.property.sellerId,
      agentId: visit.agentId ?? visit.property.agentId,
      agreedPrice: visit.interestedAmount,
      status: 'IN_PROGRESS',
    },
  })

  await prisma.$transaction([
    prisma.property.update({ where: { id: visit.property.id }, data: { status: 'UNDER_CONTRACT' } }),
    prisma.siteVisit.update({ where: { id }, data: { dealId: deal.id } }),
  ])

  await notifyUsers([
    { userId: visit.buyerId, title: 'Deal started', message: `Your deal on ${visit.property.title} has begun — paperwork is next.` },
    { userId: visit.property.sellerId, title: 'Deal started', message: `A deal on ${visit.property.title} has begun.` },
  ])

  revalidate()
  revalidatePath('/dashboard/site-visits-queue')
  revalidatePath('/dashboard/deals')
}

/** Staff assigns (or reassigns) an agent to a visit — the fix for visits
 *  requested on a property with no agent at the time, which otherwise sit
 *  invisible to everyone (no agent to see them in their queue, no admin/
 *  backend queue existed until this page). */
export async function assignSiteVisitAgent(formData: FormData) {
  await requireRole('ADMIN', 'BACKEND')
  const id = String(formData.get('id') ?? '')
  const agentId = String(formData.get('agentId') ?? '')
  if (!id) throw new Error('Missing id')
  if (!agentId) throw new Error('Missing agentId')

  const agent = await prisma.user.findUnique({ where: { id: agentId } })
  if (!agent || agent.role !== 'AGENT') throw new Error('Invalid agent')

  const visit = await prisma.siteVisit.update({
    where: { id },
    data: { agentId },
    include: { property: { select: { title: true } } },
  })

  await notifyUsers([
    { userId: agentId, title: 'Site visit assigned', message: `You've been assigned a visit request for ${visit.property.title}.` },
  ])

  revalidatePath('/dashboard/site-visits-queue')
  revalidate()
}

/** Cancel a visit. A buyer can cancel their own; an agent can cancel one assigned
 *  to them. Terminal states (COMPLETED/CANCELLED) can't be cancelled again. */
export async function cancelSiteVisit(formData: FormData) {
  const session = await requireRole('BUYER', 'AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')

  const isOwner =
    (session.user.role === 'BUYER' && visit.buyerId === session.user.id) ||
    (session.user.role === 'AGENT' && visit.agentId === session.user.id)
  if (!isOwner) throw new Error('Unauthorized')
  if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') throw new Error('Visit already closed')

  await prisma.siteVisit.update({ where: { id }, data: { status: 'CANCELLED' } })

  // Notify the counterparty.
  const notifyId = session.user.role === 'BUYER' ? visit.agentId : visit.buyerId
  if (notifyId) {
    await notifyUsers([
      {
        userId: notifyId,
        title: 'Site visit cancelled',
        message: `The visit to ${visit.property.title} was cancelled.`,
      },
    ])
  }

  revalidate()
}
