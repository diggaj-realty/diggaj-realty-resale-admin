import { prisma } from '@/lib/prisma'
import { authenticate, authenticateOptional } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'

/** List amenities — public, no auth required (listing forms and public
 *  filter UIs both consume this). By default only active ones; an ADMIN
 *  caller may pass ?all=1 to include inactive. */
export const GET = withApi(async (req) => {
  const user = await authenticateOptional(req)
  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('all') === '1' && user?.role === 'ADMIN'

  const items = await prisma.amenity.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  return ok(items.map((a) => ({ id: a.id, name: a.name, category: a.category, active: a.active })))
})

/** Create an amenity (ADMIN). */
export const POST = withApi(async (req) => {
  await authenticate(req, ['ADMIN'])
  const body = await readJson<{ name?: string; category?: string }>(req)
  const name = String(body.name ?? '').trim()
  if (!name) throw new ApiError('name is required', 400)
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null

  const existing = await prisma.amenity.findUnique({ where: { name } })
  if (existing) throw new ApiError('Amenity already exists', 409)

  const amenity = await prisma.amenity.create({ data: { name, category } })
  return ok({ id: amenity.id, name: amenity.name, category: amenity.category, active: amenity.active }, 201)
})
