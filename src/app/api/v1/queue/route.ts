import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  await authenticate(req, ['BACKEND'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const where = { status: { in: ['DRAFT', 'PENDING_VERIFICATION'] } }

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true, email: true } } },
      skip,
      take,
    }),
    prisma.property.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(propertyDTO), total, page, pageSize))
})
