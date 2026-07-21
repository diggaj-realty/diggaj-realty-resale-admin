import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'

/** Update a saved search (currently just the alerts toggle and name). */
export const PATCH = withApi(async (req, { params }) => {
  const user = await authenticate(req, ['BUYER'])
  const { id } = await params
  const body = await readJson<{ alertsEnabled?: boolean; name?: string }>(req)

  const owned = await prisma.savedSearch.findFirst({ where: { id, userId: user.id }, select: { id: true } })
  if (!owned) throw new ApiError('Saved search not found', 404)

  const updated = await prisma.savedSearch.update({
    where: { id },
    data: {
      ...(typeof body.alertsEnabled === 'boolean' ? { alertsEnabled: body.alertsEnabled } : {}),
      ...(typeof body.name === 'string' ? { name: body.name.trim() || null } : {}),
    },
  })
  return ok({ id: updated.id, name: updated.name, alertsEnabled: updated.alertsEnabled })
})

/** Delete a saved search the buyer owns. Idempotent. */
export const DELETE = withApi(async (req, { params }) => {
  const user = await authenticate(req, ['BUYER'])
  const { id } = await params
  await prisma.savedSearch.deleteMany({ where: { id, userId: user.id } })
  return ok({ id, deleted: true })
})
