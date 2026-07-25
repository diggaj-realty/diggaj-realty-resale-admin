import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'

/** The buyer's own recently-viewed properties, most recent first, deduped by
 *  property (a property viewed 3 times shows once, at its most recent view
 *  time). PropertyView rows already exist per-user for analytics — this is
 *  just the first endpoint that lists them back to the buyer who made them,
 *  rather than aggregate stats for the property owner. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const url = new URL(req.url)
  const { pageSize } = parsePagination(url)

  // distinct on propertyId (keeping the newest row per property) needs the
  // view itself ordered newest-first before Prisma's dedup, then we re-sort
  // since `distinct` preserves each group's first-matched row but not
  // necessarily overall recency order across groups on every driver.
  const views = await prisma.propertyView.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    distinct: ['propertyId'],
    take: pageSize,
    select: { propertyId: true, createdAt: true },
  })

  if (views.length === 0) return ok({ items: [] })

  const properties = await prisma.property.findMany({
    where: { id: { in: views.map((v) => v.propertyId) } },
    include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true } } },
  })
  const byId = new Map(properties.map((p) => [p.id, p]))

  const items = views
    .map((v) => {
      const property = byId.get(v.propertyId)
      return property ? { viewedAt: v.createdAt.toISOString(), ...propertyDTO(property) } : null
    })
    .filter((item): item is NonNullable<typeof item> => item != null)

  return ok({ items })
})
