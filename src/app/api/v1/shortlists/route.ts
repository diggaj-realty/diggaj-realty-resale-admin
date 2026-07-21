import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'

/** Buyer's shortlisted properties — mirrors /dashboard/shortlist. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const [items, total] = await Promise.all([
    prisma.shortlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true } } },
        },
      },
      skip,
      take,
    }),
    prisma.shortlist.count({ where: { userId: user.id } }),
  ])

  const dto = items.map((s) => ({ shortlistedAt: s.createdAt.toISOString(), ...propertyDTO(s.property) }))
  return ok(paginatedEnvelope(dto, total, page, pageSize))
})

/** Add a property to the buyer's shortlist. Idempotent — re-adding is a no-op. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const body = await readJson<{ propertyId?: string }>(req)
  const propertyId = String(body.propertyId ?? '')
  if (!propertyId) throw new ApiError('propertyId is required', 400)

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } })
  if (!property) throw new ApiError('Property not found', 404)

  const shortlist = await prisma.shortlist.upsert({
    where: { userId_propertyId: { userId: user.id, propertyId } },
    create: { userId: user.id, propertyId },
    update: {},
  })

  return ok({ id: shortlist.id, propertyId, shortlisted: true }, 201)
})
