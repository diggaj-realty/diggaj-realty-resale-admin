import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import {
  createOrUpdateInterest,
  propertyInterestDTO,
  INTEREST_SOURCES,
  type InterestSource,
} from '@/lib/data/interests'
import type { Prisma } from '@prisma/client'

/** Buyer leads.
 *
 *  GET is role-scoped: a buyer sees their own leads, an agent sees the ones
 *  assigned to them, backend/admin see everything. A seller sees the leads on
 *  their own properties, but without buyer contact details — the platform
 *  brokers that contact through the agent rather than handing it over.
 *
 *  Filters: ?status= &propertyId= &agentId= (agentId=unassigned finds leads
 *  nobody owns yet, which is the queue staff actually need).
 */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const status = url.searchParams.get('status')?.trim()
  const propertyId = url.searchParams.get('propertyId')?.trim()
  const agentIdFilter = url.searchParams.get('agentId')?.trim()

  const isStaff = hasAnyRole(user, ['BACKEND', 'ADMIN'])
  const isAgent = hasAnyRole(user, ['AGENT'])

  const where: Prisma.PropertyInterestWhereInput = {}
  if (isStaff) {
    if (agentIdFilter) where.agentId = agentIdFilter === 'unassigned' ? null : agentIdFilter
  } else if (isAgent) {
    where.agentId = user.id
  } else if (hasAnyRole(user, ['BUYER']) && !hasAnyRole(user, ['SELLER'])) {
    where.buyerId = user.id
  } else if (hasAnyRole(user, ['SELLER']) && !hasAnyRole(user, ['BUYER'])) {
    where.property = { sellerId: user.id }
  } else {
    // Dual-role account: their own leads as a buyer, plus leads on properties
    // they're selling.
    where.OR = [{ buyerId: user.id }, { property: { sellerId: user.id } }]
  }
  if (status) where.status = status
  if (propertyId) where.propertyId = propertyId

  const [items, total] = await Promise.all([
    prisma.propertyInterest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        property: { select: { title: true, location: true, askingPrice: true, status: true } },
        buyer: { select: { name: true, email: true, phone: true } },
        agent: { select: { name: true, email: true, phone: true } },
      },
      skip,
      take,
    }),
    prisma.propertyInterest.count({ where }),
  ])

  // A seller learns that interest exists and who's handling it, not how to
  // contact the buyer directly.
  const sellerOnly = hasAnyRole(user, ['SELLER']) && !isStaff && !isAgent && !hasAnyRole(user, ['BUYER'])
  const dto = items.map((i) => {
    const base = propertyInterestDTO(i)
    if (!sellerOnly) return base
    return { ...base, buyerEmail: undefined, buyerPhone: undefined }
  })

  return ok(paginatedEnvelope(dto, total, page, pageSize))
})

/** Buyer expresses genuine interest in a property.
 *
 *  This is the correct early-stage action for "I'm interested", "have someone
 *  call me", or "I'd like to see it" — none of which is an offer, and none of
 *  which creates an Offer or Deal. Idempotent per (property, buyer): calling it
 *  again updates the existing lead instead of piling up duplicates.
 */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const body = await readJson<{ propertyId?: string; source?: string; buyerNote?: string }>(req)

  const propertyId = String(body.propertyId || '').trim()
  const source = String(body.source || 'GENERAL_INTEREST').trim().toUpperCase()
  const buyerNote = body.buyerNote ? String(body.buyerNote).trim() : null

  if (!propertyId) throw new ApiError('propertyId is required', 400)
  if (!INTEREST_SOURCES.includes(source as InterestSource)) {
    throw new ApiError(`source must be one of: ${INTEREST_SOURCES.join(', ')}`, 400)
  }

  const result = await createOrUpdateInterest({
    propertyId,
    buyerId: user.id,
    buyerName: user.name,
    source: source as InterestSource,
    buyerNote,
  })

  if ('error' in result) {
    if (result.error === 'PROPERTY_NOT_FOUND') throw new ApiError('Property not found', 404)
    throw new ApiError('This property is no longer available', 400)
  }

  const full = await prisma.propertyInterest.findUnique({
    where: { id: result.interest.id },
    include: {
      property: { select: { title: true, location: true, askingPrice: true, status: true } },
      buyer: { select: { name: true, email: true, phone: true } },
      agent: { select: { name: true, email: true, phone: true } },
    },
  })

  return ok(
    { ...propertyInterestDTO(full!), agentAssigned: result.agentAssigned },
    result.isNew ? 201 : 200
  )
})
