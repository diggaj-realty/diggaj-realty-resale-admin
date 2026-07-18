import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  await authenticate(req, ['ADMIN'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const role = url.searchParams.get('role')?.trim()
  const where = role ? { role } : {}

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.user.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(userDTO), total, page, pageSize))
})
