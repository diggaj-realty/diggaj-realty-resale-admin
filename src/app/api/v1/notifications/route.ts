import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { notificationDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  const user = await authenticate(req)

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)
  const where = { userId: user.id }

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ])

  return ok({ ...paginatedEnvelope(items.map(notificationDTO), total, page, pageSize), unreadCount })
})
