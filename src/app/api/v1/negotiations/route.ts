import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { offerDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  await authenticate(req, ['BACKEND'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const where = { status: 'PENDING_REVIEW' }

  const [items, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
      skip,
      take,
    }),
    prisma.offer.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map((o) => offerDTO(o)), total, page, pageSize))
})
