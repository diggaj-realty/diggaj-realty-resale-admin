import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { kycDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  await authenticate(req, ['BACKEND'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const [items, total] = await Promise.all([
    prisma.sellerKyc.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
      skip,
      take,
    }),
    prisma.sellerKyc.count({ where: { status: 'PENDING' } }),
  ])

  const dto = items.map((k) => ({ ...kycDTO(k), userName: k.user.name, userEmail: k.user.email }))
  return ok(paginatedEnvelope(dto, total, page, pageSize))
})
