'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'

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

  await notifyUsers([
    {
      userId: agentId,
      title: 'Assigned to a deal',
      message: `You've been assigned to ${deal.property.title}`,
    },
  ])

  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

export async function assignAgentToProperty(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'BACKEND')) throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId'))
  const agentId = String(formData.get('agentId'))
  if (!propertyId || !agentId) throw new Error('Property and agent are required')

  const agent = await prisma.user.findUnique({ where: { id: agentId } })
  if (!agent || agent.role !== 'AGENT') throw new Error('Invalid agent')

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { agentId },
    select: { title: true },
  })

  await notifyUsers([
    {
      userId: agentId,
      title: 'Assigned to a listing',
      message: `You've been assigned to help manage ${property.title}`,
    },
  ])

  revalidatePath('/dashboard/listings')
  revalidatePath(`/dashboard/listings/${propertyId}`)
  revalidatePath('/dashboard')
}
