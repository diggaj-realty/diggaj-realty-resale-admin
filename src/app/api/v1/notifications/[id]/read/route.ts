import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { notificationDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req)
  const { id } = await ctx.params

  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== user.id) throw new ApiError('Notification not found', 404)

  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } })
  return ok(notificationDTO(updated))
})
