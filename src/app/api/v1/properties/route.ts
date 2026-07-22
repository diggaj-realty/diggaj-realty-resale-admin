import { prisma } from '@/lib/prisma'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import { normalizeFilters, buildPropertyWhere } from '@/lib/data/propertySearch'

/** Live, verified properties — fully public, no auth required, so an
 *  anonymous visitor can browse before signing up. Mirrors /dashboard/browse.
 *  Supports search (?q=), type (?type=), and city (?city=) filters — city
 *  is normalised the same way as the dashboard/seller-facing dropdown so
 *  "Bengaluru"/"bangalore"/etc. all match listings stored as "Bangalore". */
export const GET = withApi(async (req) => {
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const filters = normalizeFilters(Object.fromEntries(url.searchParams))
  const where = buildPropertyWhere(filters)

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true } } },
      skip,
      take,
    }),
    prisma.property.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(propertyDTO), total, page, pageSize))
})
