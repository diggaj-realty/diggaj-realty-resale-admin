import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson } from '@/lib/api/http'
import { normalizeFilters } from '@/lib/data/propertySearch'
import type { SavedSearch, Prisma } from '@prisma/client'

function savedSearchDTO(s: SavedSearch) {
  return {
    id: s.id,
    name: s.name,
    filters: s.filters,
    alertsEnabled: s.alertsEnabled,
    lastAlertedAt: s.lastAlertedAt ? s.lastAlertedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }
}

/** List the buyer's saved searches, newest first. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const items = await prisma.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok(items.map(savedSearchDTO))
})

/** Create a saved search from a filter set. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER'])
  const body = await readJson<{ name?: string; filters?: Record<string, unknown>; alertsEnabled?: boolean }>(req)

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  const filters = normalizeFilters(body.filters)
  const alertsEnabled = body.alertsEnabled !== false

  const search = await prisma.savedSearch.create({
    data: { userId: user.id, name, filters: filters as Prisma.InputJsonValue, alertsEnabled },
  })
  return ok(savedSearchDTO(search), 201)
})
