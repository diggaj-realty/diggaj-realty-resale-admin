import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'
import { logOfferEvent } from '@/lib/actions/offerEvents'
import type { Prisma } from '@prisma/client'

/** Role-scoped offers — mirrors /dashboard/offers.
 *  SELLER: offers on their properties, excluding PENDING_REVIEW (backend hasn't forwarded yet).
 *  BUYER: their own offers, with a buyer-facing displayStatus that collapses
 *  PENDING_REVIEW/PENDING into a single "PENDING".
 *  An account holding both roles (e.g. a seller who also buys) picks which
 *  side to view with `?as=buyer|seller`; defaults to buyer. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER', 'BUYER'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const isSeller = hasAnyRole(user, ['SELLER'])
  const isBuyer = hasAnyRole(user, ['BUYER'])
  const requestedAs = url.searchParams.get('as')
  const asSeller = requestedAs ? requestedAs === 'seller' && isSeller : isSeller && !isBuyer

  const where: Prisma.OfferWhereInput = asSeller
    ? { property: { sellerId: user.id }, status: { not: 'PENDING_REVIEW' } }
    : { buyerId: user.id }

  const [items, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
      skip,
      take,
    }),
    prisma.offer.count({ where }),
  ])

  const dto = items.map((o) => offerDTO(o, { forBuyer: !asSeller }))
  return ok(paginatedEnvelope(dto, total, page, pageSize))
})

/** Buyer makes an offer. Always starts as PENDING_REVIEW — the seller never
 *  sees it until the backend team forwards it. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const body = await readJson<{ propertyId?: string; amount?: number; message?: string }>(req)

  const propertyId = String(body.propertyId || '')
  const amount = Number(body.amount)
  const message = body.message ? String(body.message).trim() : null
  if (!propertyId || !Number.isFinite(amount) || amount <= 0) throw new ApiError('Invalid offer', 400)

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { sellerId: true, title: true, status: true } })
  if (!property) throw new ApiError('Property not found', 404)
  if (property.status !== 'LIVE') throw new ApiError('Property is not live', 400)

  const offer = await prisma.offer.create({
    data: { propertyId, buyerId: user.id, amount, message },
  })
  await logOfferEvent({ offerId: offer.id, type: 'CREATED', amount, actorId: user.id, actorRole: 'BUYER' })

  await prisma.notification.create({
    data: {
      userId: property.sellerId,
      title: 'New offer received',
      message: `${user.name} made an offer on ${property.title}.`,
    },
  })

  return ok(offerDTO(offer, { forBuyer: true }), 201)
})
