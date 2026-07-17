'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function updateProfile(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const name = String(formData.get('name') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  if (!name) throw new Error('Name is required')

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name, phone: phone || null },
  })

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
}
