'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function submitFeedback(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const message = String(formData.get('message') ?? '').trim()
  if (!message) throw new Error('Feedback message is required')
  const category = String(formData.get('category') ?? 'GENERAL')

  await prisma.feedback.create({
    data: { userId: session.user.id, message, category },
  })

  revalidatePath('/dashboard/feedback')
}

export async function markFeedbackReviewed(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  await prisma.feedback.update({ where: { id }, data: { status: 'REVIEWED' } })
  revalidatePath('/dashboard/feedback')
}
