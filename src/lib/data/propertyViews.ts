import { prisma } from '@/lib/prisma'

const DEDUPE_WINDOW_MS = 30 * 60 * 1000 // 30 min — collapses refreshes/re-opens by the same user

/** Records a property view and bumps Property.viewCount. To keep the count
 *  meaningful, a logged-in user's repeat views of the same property within a
 *  30-minute window are de-duplicated (logged once, counted once). Anonymous
 *  views are always recorded. Fire-and-forget safe: never throws to the caller. */
export async function recordPropertyView({ propertyId, userId }: { propertyId: string; userId?: string | null }) {
  try {
    if (userId) {
      const recent = await prisma.propertyView.findFirst({
        where: { propertyId, userId, createdAt: { gt: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
        select: { id: true },
      })
      if (recent) return
    }

    await prisma.$transaction([
      prisma.propertyView.create({ data: { propertyId, userId: userId ?? null } }),
      prisma.property.update({ where: { id: propertyId }, data: { viewCount: { increment: 1 } } }),
    ])
  } catch (err) {
    // Analytics must never break the request that triggered it.
    console.error('recordPropertyView failed', err)
  }
}

/** View stats for an owner/agent dashboard: total, unique viewers, and last-7-day count. */
export async function getPropertyViewStats(propertyId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [total, last7Days, uniqueRows] = await Promise.all([
    prisma.propertyView.count({ where: { propertyId } }),
    prisma.propertyView.count({ where: { propertyId, createdAt: { gt: since } } }),
    prisma.propertyView.findMany({
      where: { propertyId, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    }),
  ])
  return { total, last7Days, uniqueViewers: uniqueRows.length }
}
