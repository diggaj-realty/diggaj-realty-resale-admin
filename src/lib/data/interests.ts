import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import { toStoredPhone, PHONE_ERROR } from '@/lib/phone'
import { pickAgentForLead, type AssignmentReason } from '@/lib/data/agentAssignment'
import type { PropertyInterest } from '@prisma/client'

/** Buyer lead (PropertyInterest) domain rules, shared by the public API and the
 *  internal dashboard so both surfaces agree on what a lead is and who owns it.
 *
 *  The governing rule: interest is not an offer. None of this creates an Offer
 *  or a Deal — it creates the operational lead an agent works, which may or may
 *  not ever become a transaction.
 */

export const INTEREST_SOURCES = [
  'SHORTLIST',
  'CONTACT_REQUEST',
  'SITE_VISIT_REQUEST',
  'GENERAL_INTEREST',
  'OTHER',
] as const
export type InterestSource = (typeof INTEREST_SOURCES)[number]

export const INTEREST_STATUSES = [
  'NEW',
  'CONTACT_REQUESTED',
  'AGENT_ASSIGNED',
  'CONTACT_IN_PROGRESS',
  'SITE_VISIT_REQUESTED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'INTERESTED',
  'NOT_INTERESTED',
  'NEGOTIATION_IN_PROGRESS',
  'CONVERTED_TO_DEAL',
  'CLOSED',
  'CANCELLED',
] as const
export type InterestStatus = (typeof INTEREST_STATUSES)[number]

/** Statuses where the lead is finished — a new interest may be opened after one
 *  of these rather than reviving the old record. */
const TERMINAL_STATUSES: InterestStatus[] = ['CONVERTED_TO_DEAL', 'CLOSED', 'CANCELLED', 'NOT_INTERESTED']

export function isTerminalInterestStatus(status: string) {
  return TERMINAL_STATUSES.includes(status as InterestStatus)
}

/** How far along the lead is. Used so an incoming signal can advance a lead but
 *  never drag it backwards: someone who already asked for a visit and then
 *  merely re-saves the property should stay at SITE_VISIT_REQUESTED, while
 *  actually requesting a visit from AGENT_ASSIGNED must move it forward.
 *
 *  Terminal statuses are deliberately absent — they're handled by resetting the
 *  lead rather than by rank comparison. */
const STATUS_RANK: Partial<Record<InterestStatus, number>> = {
  NEW: 0,
  CONTACT_REQUESTED: 1,
  AGENT_ASSIGNED: 2,
  CONTACT_IN_PROGRESS: 3,
  SITE_VISIT_REQUESTED: 4,
  SITE_VISIT_SCHEDULED: 5,
  SITE_VISIT_COMPLETED: 6,
  INTERESTED: 7,
  NEGOTIATION_IN_PROGRESS: 8,
  CONVERTED_TO_DEAL: 9,
}

function advances(from: string, to: string) {
  const a = STATUS_RANK[from as InterestStatus]
  const b = STATUS_RANK[to as InterestStatus]
  if (a === undefined || b === undefined) return false
  return b > a
}

type InterestWithRelations = PropertyInterest & {
  property?: { title: string; location: string; askingPrice: number; status: string } | null
  buyer?: { name: string; email: string; phone: string | null } | null
  agent?: { name: string; email: string; phone: string | null } | null
}

export function propertyInterestDTO(i: InterestWithRelations) {
  return {
    id: i.id,
    propertyId: i.propertyId,
    buyerId: i.buyerId,
    agentId: i.agentId,
    status: i.status,
    source: i.source,
    buyerNote: i.buyerNote,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    propertyTitle: i.property?.title,
    propertyLocation: i.property?.location,
    propertyAskingPrice: i.property?.askingPrice,
    propertyStatus: i.property?.status,
    buyerName: i.buyer?.name,
    buyerEmail: i.buyer?.email,
    buyerPhone: i.buyer?.phone,
    agentName: i.agent?.name,
    agentEmail: i.agent?.email,
    agentPhone: i.agent?.phone,
  }
}

/** Explicitly discriminated so `'error' in result` narrows for callers — the
 *  inferred union of this function's many returns did not. */
export type CreateInterestResult =
  | { error: InterestError }
  | { interest: PropertyInterest; agentAssigned: boolean; isNew: boolean }

/** Creates the lead (or revives/updates the buyer's existing open one for this
 *  property), seeds the agent from the property's default, and notifies whoever
 *  now needs to act — the assigned agent, or staff if nobody can be assigned.
 *
 *  Returns the interest plus whether an agent could be attached, so callers can
 *  tell the buyer honestly whether someone is already on it.
 */
export async function createOrUpdateInterest({
  propertyId,
  buyerId,
  buyerName,
  source,
  buyerNote,
  buyerPhone,
}: {
  propertyId: string
  buyerId: string
  buyerName: string
  source: InterestSource
  buyerNote?: string | null
  /** Lets the frontend collect a missing number in the same request that raises
   *  the lead, rather than bouncing the buyer to a profile screen first. */
  buyerPhone?: string | null
}): Promise<CreateInterestResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, title: true, status: true, agentId: true, sellerId: true, city: true },
  })
  if (!property) return { error: 'PROPERTY_NOT_FOUND' as const }

  // A lead only makes sense on something still on the market. UNDER_CONTRACT /
  // CLOSED / rejected properties aren't discoverable, so expressing interest in
  // one is a stale-page action rather than a real intent.
  if (property.status !== 'LIVE') return { error: 'PROPERTY_NOT_AVAILABLE' as const }

  // A lead is a promise that someone will phone this buyer, so it cannot be
  // raised without a number to phone. Enforced here rather than in each route
  // so no entry point (interests, property interest, site-visit request) can
  // create an unworkable lead. Google signups arrive without a phone, which is
  // exactly the case this catches — buyerPhone lets the frontend supply it in
  // the same request instead of sending the buyer away to a settings screen.
  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
  let phone = buyer?.phone ?? null
  if (buyerPhone) {
    const normalized = toStoredPhone(buyerPhone)
    if (!normalized) return { error: 'INVALID_PHONE' as const }
    if (normalized !== phone) {
      await prisma.user.update({ where: { id: buyerId }, data: { phone: normalized } })
    }
    phone = normalized
  }
  if (!phone) return { error: 'BUYER_PHONE_REQUIRED' as const }

  const existing = await prisma.propertyInterest.findUnique({
    where: { propertyId_buyerId: { propertyId, buyerId } },
  })

  // Seed from the property's default agent. Once set on the interest it's the
  // operational owner and is not silently re-read from the property again.
  //
  // Where neither the lead nor the listing has one, an agent is chosen rather
  // than the lead being left at NEW for someone to notice — that gap is what
  // produced deals with no agent on them. See pickAgentForLead for the rule.
  let assignmentReason: AssignmentReason | null = null
  let agentId = existing?.agentId ?? property.agentId ?? null
  if (!agentId) {
    const pick = await pickAgentForLead({ buyerId, city: property.city })
    agentId = pick.agentId
    assignmentReason = pick.reason
  }
  const isNew = !existing
  const wasTerminal = existing ? isTerminalInterestStatus(existing.status) : false

  // Only an explicit ask carries status meaning. Saving/shortlisting or a
  // generic "interested" tap is a real lead but says nothing new about where it
  // is, so on an existing lead it must not move the status at all — otherwise a
  // buyer re-saving a property would appear to change the operational state.
  const signalStatus =
    source === 'SITE_VISIT_REQUEST' ? 'SITE_VISIT_REQUESTED'
    : source === 'CONTACT_REQUEST' ? 'CONTACT_REQUESTED'
    : null

  // A brand-new lead still needs *some* opening status.
  const nextStatus = signalStatus ?? (agentId ? 'AGENT_ASSIGNED' : 'NEW')

  const interest = existing
    ? await prisma.propertyInterest.update({
        where: { id: existing.id },
        data: {
          agentId,
          buyerNote: buyerNote ?? existing.buyerNote,
          source: source ?? existing.source,
          // Reopening a finished lead restarts it. An in-flight one only moves
          // on an explicit signal that genuinely advances it — see `advances`.
          ...(wasTerminal
            ? { status: nextStatus }
            : signalStatus && advances(existing.status, signalStatus)
              ? { status: signalStatus }
              : {}),
        },
      })
    : await prisma.propertyInterest.create({
        data: { propertyId, buyerId, agentId, source, buyerNote: buyerNote ?? null, status: nextStatus },
      })

  await recordAudit({
    action: isNew ? 'INTEREST_CREATED' : 'INTEREST_STATUS_CHANGED',
    actorId: buyerId,
    entity: 'PropertyInterest',
    entityId: interest.id,
    meta: { propertyId, source, agentId, reopened: wasTerminal, assignmentReason },
  })

  if (agentId) {
    await notifyUsers([
      {
        userId: agentId,
        title: isNew ? 'New buyer interest' : 'Buyer interest updated',
        message: `${buyerName} is interested in ${property.title}. Reach out to them to take this forward.`,
      },
    ])
  } else {
    // Only reachable when the platform has no active agent at all, now that
    // assignment is automatic — so this is a staffing problem, not a triage one,
    // and it goes to admins who can do something about it rather than to every
    // backend user. Broadcasting every unassigned lead to the whole desk was how
    // these notifications got tuned out.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    })
    await notifyUsers(
      admins.map((a) => ({
        userId: a.id,
        title: 'Buyer lead could not be assigned',
        message: `${buyerName} is interested in ${property.title}, but there are no active agents to assign it to.`,
      }))
    )
  }

  return { interest, agentAssigned: agentId != null, isNew }
}

/** Assigns (or reassigns) the agent operationally responsible for a lead, and
 *  cascades onto that lead's not-yet-finished site visits so the same person
 *  owns the whole thread rather than the visit keeping a stale agent. */
export async function assignInterestAgent({
  interestId,
  agentId,
  actorId,
}: {
  interestId: string
  agentId: string
  actorId: string
}) {
  const agent = await prisma.user.findUnique({ where: { id: agentId } })
  if (!agent || agent.role !== 'AGENT' || !agent.isActive) return { error: 'INVALID_AGENT' as const }

  const interest = await prisma.propertyInterest.findUnique({
    where: { id: interestId },
    include: { property: { select: { title: true } } },
  })
  if (!interest) return { error: 'INTEREST_NOT_FOUND' as const }

  const updated = await prisma.propertyInterest.update({
    where: { id: interestId },
    data: {
      agentId,
      // Only advance a lead that hasn't started moving; don't drag one back
      // from SITE_VISIT_SCHEDULED to AGENT_ASSIGNED on a reassignment.
      ...(interest.status === 'NEW' || interest.status === 'CONTACT_REQUESTED' ? { status: 'AGENT_ASSIGNED' } : {}),
    },
  })

  await prisma.siteVisit.updateMany({
    where: { interestId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
    data: { agentId },
  })

  await recordAudit({
    action: 'AGENT_ASSIGNED',
    actorId,
    entity: 'PropertyInterest',
    entityId: interestId,
    meta: { agentId, previousAgentId: interest.agentId },
  })

  await notifyUsers([
    {
      userId: agentId,
      title: 'Assigned to a buyer lead',
      message: `You've been assigned a buyer interested in ${interest.property.title}.`,
    },
  ])

  return { interest: updated }
}

/** Every failure `createOrUpdateInterest` can return, as message + HTTP status.
 *
 *  Centralised because three routes consume it (POST /interests,
 *  POST /properties/:id/interest, POST /site-visits) and each previously
 *  hand-mapped the two cases that existed, collapsing anything unrecognised into
 *  "no longer available" — which would have reported a missing phone number as a
 *  sold property.
 */
export const INTEREST_ERROR_RESPONSES = {
  PROPERTY_NOT_FOUND: { message: 'Property not found', status: 404 },
  PROPERTY_NOT_AVAILABLE: { message: 'This property is no longer available', status: 400 },
  INVALID_PHONE: { message: PHONE_ERROR, status: 400 },
  BUYER_PHONE_REQUIRED: {
    message: 'A mobile number is required before you can register interest — an agent needs to be able to call you.',
    status: 422,
  },
} as const satisfies Record<string, { message: string; status: number }>

export type InterestError = keyof typeof INTEREST_ERROR_RESPONSES

export function interestErrorResponse(error: InterestError) {
  return INTEREST_ERROR_RESPONSES[error]
}
