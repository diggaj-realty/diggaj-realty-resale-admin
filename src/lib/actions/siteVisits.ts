'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'

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
export async function scheduleSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const scheduledDate = parseDate(formData.get('scheduledDate'), 'date')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.agentId && visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.status !== 'REQUESTED') throw new Error('Only a requested visit can be scheduled')

  await prisma.siteVisit.update({
    where: { id },
    data: { status: 'SCHEDULED', scheduledDate, agentId: session.user.id },
  })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: 'Site visit scheduled',
      message: `Your visit to ${visit.property.title} is confirmed for ${scheduledDate.toLocaleString('en-IN')}.`,
    },
  ])

  revalidate()
}

/** Agent marks a visit COMPLETED and records post-visit feedback. */
export async function completeSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const feedback = String(formData.get('feedback') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.agentId !== session.user.id) throw new Error('Unauthorized')
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

/** Agent records what happened after a COMPLETED visit — the negotiation
 *  itself happens in person, never online, so this just logs the outcome.
 *  Callable repeatedly (further in-person rounds can update the amount)
 *  right up until a Deal is created from this visit — see
 *  createDealFromSiteVisit. Defaults the amount to the property's asking
 *  price the first time "interested" is recorded with no amount given. */
export async function recordSiteVisitOutcome(formData: FormData) {
  const session = await requireRole('AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const outcome = String(formData.get('outcome') ?? '')
  if (!['INTERESTED', 'NOT_INTERESTED'].includes(outcome)) throw new Error('Invalid outcome')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true, askingPrice: true } } },
  })
  if (!visit) throw new Error('Visit not found')
  if (visit.agentId !== session.user.id) throw new Error('Unauthorized')
  if (visit.status !== 'COMPLETED') throw new Error('Log the visit as completed before recording an outcome')
  if (visit.dealId) throw new Error('A deal has already been created from this visit')

  const amountRaw = formData.get('interestedAmount')
  const interestedAmount =
    outcome === 'INTERESTED'
      ? amountRaw && String(amountRaw).trim() ? Number(amountRaw) : (visit.interestedAmount ?? visit.property.askingPrice)
      : null

  if (outcome === 'INTERESTED' && (!interestedAmount || interestedAmount <= 0)) {
    throw new Error('Enter a valid amount')
  }

  await prisma.siteVisit.update({ where: { id }, data: { outcome, interestedAmount } })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: outcome === 'INTERESTED' ? 'Great news' : 'Visit outcome recorded',
      message:
        outcome === 'INTERESTED'
          ? `Your interest in ${visit.property.title} has been noted — paperwork can begin once the price is finalized.`
          : `Your visit to ${visit.property.title} has been closed out.`,
    },
  ])

  revalidate()
  revalidatePath('/dashboard/site-visits-queue')
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
  const existingDeal = await prisma.deal.findUnique({ where: { propertyId: visit.property.id } })
  if (existingDeal) throw new Error('This property already has a deal in progress.')

  const deal = await prisma.deal.create({
    data: {
      propertyId: visit.property.id,
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
