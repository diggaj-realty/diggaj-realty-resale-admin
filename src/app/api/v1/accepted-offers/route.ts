import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { computeDealProgress } from '@/lib/data/dealProgress'
import type { Prisma } from '@prisma/client'

/** Accepted offers — the post-acceptance operational queue.
 *
 *  A Deal row is created the moment an offer is accepted, so a deal *is* the
 *  accepted offer for this workflow. This endpoint returns each one with enough
 *  rolled-up state (agent, visit, documents, payments, derived stage) that the
 *  internal team can triage without opening every record.
 *
 *  AGENT sees only their own assignments; BACKEND/ADMIN see everything.
 *  Filters: ?agentId= &dealStatus= &siteVisitStatus= &paymentStatus= &stage= */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const agentIdFilter = url.searchParams.get('agentId')?.trim()
  const dealStatus = url.searchParams.get('dealStatus')?.trim()
  const siteVisitStatus = url.searchParams.get('siteVisitStatus')?.trim()
  const paymentStatus = url.searchParams.get('paymentStatus')?.trim()
  const stage = url.searchParams.get('stage')?.trim()

  const where: Prisma.DealWhereInput = {}
  if (user.role === 'AGENT') {
    where.agentId = user.id
  } else if (agentIdFilter) {
    // "unassigned" is the state the team actually needs to find, so make it queryable.
    where.agentId = agentIdFilter === 'unassigned' ? null : agentIdFilter
  }
  if (dealStatus) where.status = dealStatus
  if (siteVisitStatus) where.siteVisit = { status: siteVisitStatus }
  if (paymentStatus) where.paymentRequests = { some: { status: paymentStatus } }

  const include = {
    property: { select: { id: true, title: true, location: true, status: true, plan: true } },
    buyer: { select: { id: true, name: true, email: true, phone: true } },
    seller: { select: { id: true, name: true, email: true, phone: true } },
    agent: { select: { id: true, name: true } },
    documents: { select: { status: true } },
    offlineNegotiations: { select: { id: true, agreedAmount: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
    paymentRequests: { select: { status: true, amount: true } },
    siteVisit: { select: { status: true, outcome: true } },
  }

  // `stage` is derived rather than stored, so it can't be a DB filter — page
  // through the matching rows and narrow afterwards.
  if (stage) {
    const all = await prisma.deal.findMany({ where, orderBy: { createdAt: 'desc' }, include })
    const matched = all.filter((d) => computeDealProgress(d).stage === stage)
    const items = matched.slice(skip, skip + take)
    return ok(paginatedEnvelope(items.map(acceptedOfferSummary), matched.length, page, pageSize))
  }

  const [items, total] = await Promise.all([
    prisma.deal.findMany({ where, orderBy: { createdAt: 'desc' }, include, skip, take }),
    prisma.deal.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(acceptedOfferSummary), total, page, pageSize))
})

type SummaryInput = Awaited<ReturnType<typeof fetchOne>>
async function fetchOne() {
  return prisma.deal.findFirstOrThrow({
    include: {
      property: { select: { id: true, title: true, location: true, status: true, plan: true } },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      seller: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true } },
      documents: { select: { status: true } },
      offlineNegotiations: { select: { id: true, agreedAmount: true } },
      paymentRequests: { select: { status: true, amount: true } },
      siteVisit: { select: { status: true, outcome: true } },
    },
  })
}

export function acceptedOfferSummary(d: SummaryInput) {
  const progress = computeDealProgress(d)
  return {
    dealId: d.id,
    propertyId: d.propertyId,
    propertyTitle: d.property.title,
    propertyLocation: d.property.location,
    propertyStatus: d.property.status,
    propertyPlan: d.property.plan,
    buyerId: d.buyerId,
    buyerName: d.buyer.name,
    sellerId: d.sellerId,
    sellerName: d.seller.name,
    agentId: d.agentId,
    agentName: d.agent?.name ?? null,
    agreedPrice: d.agreedPrice,
    offlineAgreedAmount: d.offlineNegotiations[0]?.agreedAmount ?? null,
    dealStatus: d.status,
    acceptedAt: d.createdAt.toISOString(),
    siteVisitStatus: d.siteVisit?.status ?? null,
    siteVisitOutcome: d.siteVisit?.outcome ?? null,
    stage: progress.stage,
    stageLabel: progress.label,
    documents: progress.documents,
    payments: progress.payments,
  }
}
