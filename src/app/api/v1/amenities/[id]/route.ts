import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'

/** Update an amenity — rename, recategorise, or toggle active (ADMIN). */
export const PATCH = withApi(async (req, { params }) => {
  await authenticate(req, ['ADMIN'])
  const { id } = await params
  const body = await readJson<{ name?: string; category?: string | null; active?: boolean }>(req)

  const existing = await prisma.amenity.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Amenity not found', 404)

  const amenity = await prisma.amenity.update({
    where: { id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(body.category !== undefined ? { category: body.category ? String(body.category).trim() : null } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    },
  })
  return ok({ id: amenity.id, name: amenity.name, category: amenity.category, active: amenity.active })
})

/** Delete an amenity (ADMIN). Existing property.amenities values are unaffected. */
export const DELETE = withApi(async (req, { params }) => {
  await authenticate(req, ['ADMIN'])
  const { id } = await params
  await prisma.amenity.deleteMany({ where: { id } })
  return ok({ id, deleted: true })
})
