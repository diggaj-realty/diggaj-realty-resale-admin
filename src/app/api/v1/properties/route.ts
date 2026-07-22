import { prisma } from '@/lib/prisma'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import type { Prisma } from '@prisma/client'

/** Live, verified properties — fully public, no auth required, so an
 *  anonymous visitor can browse before signing up. Mirrors /dashboard/browse.
 *  Supports search (?q=) and type filter (?type=). */
export const GET = withApi(async (req) => {
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const q = url.searchParams.get('q')?.trim()
  const type = url.searchParams.get('type')?.trim()

  const where: Prisma.PropertyWhereInput = { status: 'LIVE' }
  if (type) where.type = type
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ]
  }

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
