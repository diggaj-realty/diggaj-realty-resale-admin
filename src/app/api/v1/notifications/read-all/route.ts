import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi } from '@/lib/api/http'

export const POST = withApi(async (req) => {
  const user = await authenticate(req)
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  })
  return ok({ updated: result.count })
})
