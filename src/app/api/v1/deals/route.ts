import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'
import type { Prisma } from '@prisma/client'

/** Role-scoped deals — mirrors /dashboard/deals.
 *  SELLER/BUYER/AGENT: own deals. ADMIN: all. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const where: Prisma.DealWhereInput =
    user.role === 'SELLER' ? { sellerId: user.id }
    : user.role === 'BUYER' ? { buyerId: user.id }
    : user.role === 'AGENT' ? { agentId: user.id }
    : {}

  const [items, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { title: true, location: true } },
        buyer: { select: { name: true } },
        seller: { select: { name: true } },
        agent: { select: { name: true } },
      },
      skip,
      take,
    }),
    prisma.deal.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(dealDTO), total, page, pageSize))
})
