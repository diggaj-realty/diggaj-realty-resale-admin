'use server'

import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'

const STAFF_CREATABLE_ROLES = ['AGENT', 'BACKEND']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createStaffUser(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const phone = String(formData.get('phone') || '').trim() || null
  const role = String(formData.get('role') || '').trim().toUpperCase()

  if (!name) throw new Error('Name is required')
  if (!EMAIL_RE.test(email)) throw new Error('A valid email is required')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  if (!STAFF_CREATABLE_ROLES.includes(role)) throw new Error(`Role must be one of: ${STAFF_CREATABLE_ROLES.join(', ')}`)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('An account with this email already exists')

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { name, email, phone, passwordHash, role } })

  revalidatePath('/dashboard/users')
}

const ASSIGNABLE_ROLES = ['AGENT', 'BACKEND', 'ADMIN']

/** Approves a pending self-signup (role: 'PENDING', isActive: false) by
 *  assigning it a real internal role and activating it. */
export async function approveUser(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const userId = String(formData.get('userId') || '')
  const role = String(formData.get('role') || '').trim().toUpperCase()
  if (!userId) throw new Error('userId is required')
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`)

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target || target.role !== 'PENDING') throw new Error('This account is not awaiting approval')

  await prisma.user.update({ where: { id: userId }, data: { role, isActive: true } })

  revalidatePath('/dashboard/users')
}

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
