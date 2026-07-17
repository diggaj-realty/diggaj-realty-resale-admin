'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function makeOffer(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId'))
  const amount = Number(formData.get('amount'))
  if (!propertyId || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid offer')

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { sellerId: true, title: true } })
  if (!property) throw new Error('Property not found')

  await prisma.offer.create({
    data: { propertyId, buyerId: session.user.id, amount, status: 'PENDING' },
  })

  await prisma.notification.create({
    data: {
      userId: property.sellerId,
      title: 'New offer received',
      message: `${session.user.name} made an offer on ${property.title}.`,
    },
  })

  revalidatePath('/dashboard/browse')
  revalidatePath('/dashboard')
}
