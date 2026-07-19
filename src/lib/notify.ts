import { prisma } from '@/lib/prisma'

interface NotifyInput {
  userId: string
  title: string
  message: string
}

/** Creates in-app notifications, skipping users who disabled push notifications. */
export async function notifyUsers(inputs: NotifyInput[]) {
  if (inputs.length === 0) return
  const userIds = Array.from(new Set(inputs.map((n) => n.userId)))
  const optedIn = await prisma.user.findMany({
    where: { id: { in: userIds }, pushNotifications: true },
    select: { id: true },
  })
  const allowed = new Set(optedIn.map((u) => u.id))
  const data = inputs.filter((n) => allowed.has(n.userId))
  if (data.length > 0) await prisma.notification.createMany({ data })
}
