import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
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
    buyerNote: v.buyerNote,
    feedback: v.feedback,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    propertyTitle: v.property?.title,
    propertyLocation: v.property?.location,
    buyerName: v.buyer?.name,
    agentName: v.agent?.name,
  }
}

/** Role-scoped site visits. BUYER: their own requests. AGENT: visits assigned to
 *  them. Optional ?status= filter. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER', 'AGENT'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const status = url.searchParams.get('status')?.trim()

  const where: Prisma.SiteVisitWhereInput =
    user.role === 'BUYER' ? { buyerId: user.id } : { agentId: user.id }
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

/** Buyer requests a site visit. Auto-routes to the property's assigned agent. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])

  const config = await prisma.appConfig.findFirst({ select: { siteVisitsEnabled: true } })
  if (config && config.siteVisitsEnabled === false) throw new ApiError('Site visits are currently disabled', 403)

  const body = await readJson<{ propertyId?: string; requestedDate?: string; buyerNote?: string }>(req)
  const propertyId = String(body.propertyId ?? '')
  if (!propertyId) throw new ApiError('propertyId is required', 400)
  const requestedDate = new Date(String(body.requestedDate ?? ''))
  if (Number.isNaN(requestedDate.getTime())) throw new ApiError('requestedDate must be a valid date', 400)

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { agentId: true } })
  if (!property) throw new ApiError('Property not found', 404)

  const visit = await prisma.siteVisit.create({
    data: {
      propertyId,
      buyerId: user.id,
      agentId: property.agentId,
      requestedDate,
      buyerNote: typeof body.buyerNote === 'string' && body.buyerNote.trim() ? body.buyerNote.trim() : null,
      status: 'REQUESTED',
    },
  })

  return ok(siteVisitDTO(visit), 201)
})
