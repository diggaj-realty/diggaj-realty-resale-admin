import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { createOrUpdateInterest } from '@/lib/data/interests'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import type { Prisma, SiteVisit } from '@prisma/client'

type SiteVisitWithRelations = SiteVisit & {
  property?: { title: string; location: string } | null
  buyer?: { name: string } | null
  agent?: { name: string } | null
}

export function siteVisitDTO(v: SiteVisitWithRelations) {
  return {
    id: v.id,
    propertyId: v.propertyId,
    buyerId: v.buyerId,
    agentId: v.agentId,
    status: v.status,
    requestedDate: v.requestedDate.toISOString(),
    scheduledDate: v.scheduledDate ? v.scheduledDate.toISOString() : null,
    // A time put forward but not yet agreed, and by whom. The frontend needs both
    // to know whether to show accept/decline (the other side proposed) or a
    // "waiting on them" state (we proposed) — without proposedBy it can't tell
    // those apart and would offer the proposer a button to accept themselves.
    proposedDate: v.proposedDate ? v.proposedDate.toISOString() : null,
    proposedBy: v.proposedBy,
    /** Whose response the visit is waiting on, so the client doesn't re-derive it. */
    awaitingResponseFrom:
      v.status === 'REQUESTED' && v.proposedBy ? (v.proposedBy === 'BUYER' ? 'AGENT' : 'BUYER') : null,
    buyerNote: v.buyerNote,
    feedback: v.feedback,
    outcome: v.outcome,
    interestedAmount: v.interestedAmount,
    interestId: v.interestId,
    dealId: v.dealId,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    propertyTitle: v.property?.title,
    propertyLocation: v.property?.location,
    buyerName: v.buyer?.name,
    agentName: v.agent?.name,
  }
}

/** Role-scoped site visits. BUYER: their own requests. AGENT: visits assigned to
 *  them. SELLER: visits requested on their own properties (read-only — sellers
 *  can't schedule/cancel, only see who's coming and any post-visit feedback).
 *  An account holding both BUYER and SELLER picks a side with `?as=buyer|seller`
 *  (defaults to buyer); AGENT never combines with the other two so it's always
 *  used when held. Optional ?status= filter. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER', 'AGENT', 'SELLER'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const status = url.searchParams.get('status')?.trim()

  const isAgent = hasAnyRole(user, ['AGENT'])
  const isSeller = hasAnyRole(user, ['SELLER'])
  const isBuyer = hasAnyRole(user, ['BUYER'])
  const requestedAs = url.searchParams.get('as')
  const asSeller = requestedAs ? requestedAs === 'seller' && isSeller : isSeller && !isBuyer

  const where: Prisma.SiteVisitWhereInput =
    isAgent ? { agentId: user.id }
    : asSeller ? { property: { sellerId: user.id } }
    : { buyerId: user.id }
  if (status) where.status = status

  const [items, total] = await Promise.all([
    prisma.siteVisit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { title: true, location: true } },
        buyer: { select: { name: true } },
        agent: { select: { name: true } },
      },
      skip,
      take,
    }),
    prisma.siteVisit.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(siteVisitDTO), total, page, pageSize))
})

/** Buyer requests a site visit.
 *
 *  A visit now belongs to a buyer lead (PropertyInterest): requesting one is
 *  itself an expression of interest, so this creates or updates the lead and
 *  hangs the visit off it. The visit inherits the *lead's* agent rather than
 *  re-reading Property.agentId, since the lead is where operational ownership
 *  lives once it's been assigned or reassigned.
 *
 *  A visit can still exist without an agent (nothing to route it to yet) — staff
 *  get told to assign one, and assigning the lead's agent later cascades onto
 *  the visit. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])

  const config = await prisma.appConfig.findFirst({ select: { siteVisitsEnabled: true } })
  if (config && config.siteVisitsEnabled === false) throw new ApiError('Site visits are currently disabled', 403)

  const body = await readJson<{ propertyId?: string; requestedDate?: string; buyerNote?: string }>(req)
  const propertyId = String(body.propertyId ?? '')
  if (!propertyId) throw new ApiError('propertyId is required', 400)
  const requestedDate = new Date(String(body.requestedDate ?? ''))
  if (Number.isNaN(requestedDate.getTime())) throw new ApiError('requestedDate must be a valid date', 400)
  const buyerNote = typeof body.buyerNote === 'string' && body.buyerNote.trim() ? body.buyerNote.trim() : null

  const interestResult = await createOrUpdateInterest({
    propertyId,
    buyerId: user.id,
    buyerName: user.name,
    source: 'SITE_VISIT_REQUEST',
    buyerNote,
  })
  if ('error' in interestResult) {
    if (interestResult.error === 'PROPERTY_NOT_FOUND') throw new ApiError('Property not found', 404)
    throw new ApiError('This property is no longer available', 400)
  }
  const { interest } = interestResult

  const visit = await prisma.siteVisit.create({
    data: {
      propertyId,
      buyerId: user.id,
      agentId: interest.agentId,
      interestId: interest.id,
      requestedDate,
      buyerNote,
      status: 'REQUESTED',
    },
  })

  await recordAudit({
    action: 'SITE_VISIT_REQUESTED',
    actorId: user.id,
    entity: 'SiteVisit',
    entityId: visit.id,
    meta: { propertyId, interestId: interest.id, agentId: interest.agentId },
  })

  if (interest.agentId) {
    await notifyUsers([
      {
        userId: interest.agentId,
        title: 'New site-visit request',
        message: `${user.name} has requested a site visit. Confirm a date with them.`,
      },
    ])
  }

  return ok(siteVisitDTO(visit), 201)
})
