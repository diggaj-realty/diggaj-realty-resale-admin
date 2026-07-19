'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadFile } from '@/lib/upload'

export async function updateProfile(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const name = String(formData.get('name') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  if (!name) throw new Error('Name is required')

  const avatarFile = formData.get('avatar')
  let avatarUrl: string | undefined
  if (avatarFile instanceof File && avatarFile.size > 0) {
    avatarUrl = await uploadFile(avatarFile, 'avatars', session.user.id)
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name, phone: phone || null, ...(avatarUrl ? { avatarUrl } : {}) },
  })

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
}

export async function updateNotificationPrefs(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      emailNotifications: formData.get('emailNotifications') === 'on',
      pushNotifications: formData.get('pushNotifications') === 'on',
    },
  })

  revalidatePath('/dashboard/settings')
}

export async function changePassword(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const currentPassword = String(formData.get('currentPassword') || '')
  const newPassword = String(formData.get('newPassword') || '')

  if (!currentPassword || !newPassword) throw new Error('All fields are required')
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters')

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) throw new Error('Unauthorized')

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isValid) throw new Error('Current password is incorrect')

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  })

  revalidatePath('/dashboard/settings')
}
