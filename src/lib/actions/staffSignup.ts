'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Public, unauthenticated signup for the internal dashboard. No role can be
 *  requested — the account is created inactive with role 'PENDING' and stays
 *  unable to log in until an ADMIN assigns a real role via approveUser(). */
export async function requestStaffSignup(formData: FormData) {
  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const phone = String(formData.get('phone') || '').trim() || null

  if (!name) throw new Error('Name is required')
  if (!EMAIL_RE.test(email)) throw new Error('A valid email is required')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('An account with this email already exists')

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { name, email, phone, passwordHash, role: 'PENDING', isActive: false } })

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await notifyUsers(
    admins.map((a) => ({
      userId: a.id,
      title: 'New signup awaiting approval',
      message: `${name} (${email}) signed up and needs a role assigned.`,
    }))
  )
}
