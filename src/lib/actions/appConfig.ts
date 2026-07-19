'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getAppConfig() {
  return prisma.appConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })
}

export async function updateAppConfig(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')

  const commissionPercent = Number(formData.get('commissionPercent'))
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error('Commission percent must be between 0 and 100.')
  }
  const kycAutoApproveEnabled = formData.get('kycAutoApproveEnabled') === 'on'
  const listingApprovalRequired = formData.get('listingApprovalRequired') === 'on'
  const supportEmail = String(formData.get('supportEmail') ?? '').trim()

  await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    update: {
      commissionPercent,
      kycAutoApproveEnabled,
      listingApprovalRequired,
      supportEmail: supportEmail || null,
    },
    create: {
      id: 'singleton',
      commissionPercent,
      kycAutoApproveEnabled,
      listingApprovalRequired,
      supportEmail: supportEmail || null,
    },
  })

  revalidatePath('/dashboard/settings')
}
