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
