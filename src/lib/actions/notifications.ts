'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function markNotificationRead(notificationId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const notification = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notification || notification.userId !== session.user.id) throw new Error('Unauthorized')

  await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } })

  revalidatePath('/dashboard')
}

export async function markAllRead() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  revalidatePath('/dashboard')
}
