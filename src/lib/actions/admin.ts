'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function toggleUserActive(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const userId = String(formData.get('userId'))
  const nextActive = String(formData.get('nextActive')) === 'true'

  await prisma.user.update({ where: { id: userId }, data: { isActive: nextActive } })

  revalidatePath('/dashboard/users')
  revalidatePath('/dashboard')
}

export async function assignAgent(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const agentId = String(formData.get('agentId'))
  if (!dealId || !agentId) throw new Error('Deal and agent are required')

  const agent = await prisma.user.findUnique({ where: { id: agentId } })
  if (!agent || agent.role !== 'AGENT') throw new Error('Invalid agent')

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { agentId },
    include: { property: { select: { title: true } } },
  })

  await prisma.notification.create({
    data: {
      userId: agentId,
      title: 'Assigned to a deal',
      message: `You've been assigned to ${deal.property.title}`,
    },
  })

  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}
