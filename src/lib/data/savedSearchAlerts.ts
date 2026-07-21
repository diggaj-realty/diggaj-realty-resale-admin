import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { buildPropertyWhere, normalizeFilters } from '@/lib/data/propertySearch'

/** Scans alert-enabled saved searches for LIVE properties that appeared since the
 *  search was last alerted (or created), notifies the owner, and advances
 *  lastAlertedAt. Idempotent per run: a property is only counted while it's newer
 *  than the watermark. Intended to be driven by a scheduler (cron hits the
 *  /api/v1/saved-searches/run-alerts endpoint) but safe to call ad hoc.
 *
 *  Gated by AppConfig.savedSearchAlerts — returns early when the platform toggle
 *  is off so no notifications go out. Pass a userId to scope the scan to one buyer. */
export async function runSavedSearchAlerts(userId?: string): Promise<{ scanned: number; notified: number }> {
  const config = await prisma.appConfig.findFirst({ select: { savedSearchAlerts: true } })
  if (config && config.savedSearchAlerts === false) return { scanned: 0, notified: 0 }

  const searches = await prisma.savedSearch.findMany({
    where: { alertsEnabled: true, ...(userId ? { userId } : {}) },
  })

  const notifications: { userId: string; title: string; message: string }[] = []
  let notified = 0

  for (const search of searches) {
    const filters = normalizeFilters(search.filters as Record<string, unknown> | null)
    const since = search.lastAlertedAt ?? search.createdAt

    const matchCount = await prisma.property.count({
      where: { ...buildPropertyWhere(filters), createdAt: { gt: since } },
    })

    if (matchCount > 0) {
      const label = search.name ? `"${search.name}"` : 'your saved search'
      notifications.push({
        userId: search.userId,
        title: 'New matches for your saved search',
        message: `${matchCount} new ${matchCount === 1 ? 'property matches' : 'properties match'} ${label}.`,
      })
      notified += 1
    }

    // Advance the watermark regardless — even a zero-match scan moves time forward.
    await prisma.savedSearch.update({
      where: { id: search.id },
      data: { lastAlertedAt: new Date() },
    })
  }

  await notifyUsers(notifications)
  return { scanned: searches.length, notified }
}
