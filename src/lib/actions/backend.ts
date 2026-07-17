'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireBackend() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BACKEND') throw new Error('Unauthorized')
  return session
}

export async function reviewKyc(formData: FormData) {
  await requireBackend()
  const kycId = String(formData.get('kycId'))
  const decision = String(formData.get('decision')) as 'APPROVED' | 'REJECTED'

  const kyc = await prisma.sellerKyc.update({
    where: { id: kycId },
    data: { status: decision },
  })

  await prisma.notification.create({
    data: {
      userId: kyc.userId,
      title: decision === 'APPROVED' ? 'KYC approved' : 'KYC rejected',
      message: decision === 'APPROVED'
        ? 'Your seller KYC has been verified. You can now publish listings.'
        : 'Your KYC submission was rejected. Please resubmit your documents.',
    },
  })

  revalidatePath('/dashboard/kyc')
  revalidatePath('/dashboard')
}

export async function reviewListing(formData: FormData) {
  await requireBackend()
  const propertyId = String(formData.get('propertyId'))
  const decision = String(formData.get('decision')) as 'LIVE' | 'REJECTED'

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { status: decision, verifiedAt: decision === 'LIVE' ? new Date() : null },
  })

  await prisma.notification.create({
    data: {
      userId: property.sellerId,
      title: decision === 'LIVE' ? 'Listing approved' : 'Listing rejected',
      message: decision === 'LIVE'
        ? `${property.title} is now live on the platform.`
        : `${property.title} was rejected during verification.`,
    },
  })

  revalidatePath('/dashboard/queue')
  revalidatePath('/dashboard')
}
