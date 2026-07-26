import { prisma } from '@/lib/prisma'
import { authenticate, hasAnyRole } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'
import type { Prisma } from '@prisma/client'

/** Role-scoped deals — mirrors /dashboard/deals.
 *  SELLER/BUYER/AGENT: own deals. ADMIN: all. A deal always has distinct
 *  buyer/seller parties, so an account holding both roles (e.g. a seller who
 *  also buys) just sees the union — no single-perspective toggle needed like
 *  offers/site-visits, where the same record reads differently per side. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const isAdmin = hasAnyRole(user, ['ADMIN'])
  const orClauses: Prisma.DealWhereInput[] = []
  if (hasAnyRole(user, ['SELLER'])) orClauses.push({ sellerId: user.id })
  if (hasAnyRole(user, ['BUYER'])) orClauses.push({ buyerId: user.id })
  if (hasAnyRole(user, ['AGENT'])) orClauses.push({ agentId: user.id })

  const where: Prisma.DealWhereInput = isAdmin ? {} : { OR: orClauses }

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
