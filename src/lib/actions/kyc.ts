'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { uploadFile } from '@/lib/upload'
import { getAppConfig } from '@/lib/actions/appConfig'

export async function submitKyc(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SELLER') throw new Error('Unauthorized')

  const idType = String(formData.get('idType') ?? '')
  const idDocFile = formData.get('idDocFile') as File | null
  const selfieFile = formData.get('selfieFile') as File | null

  if (!idType) throw new Error('ID type is required.')
  if (!idDocFile || idDocFile.size === 0) throw new Error('ID document is required.')
  if (!selfieFile || selfieFile.size === 0) throw new Error('Selfie is required.')

  const userId = session.user.id

  const [idDocUrl, selfieUrl] = await Promise.all([
    uploadFile(idDocFile, 'kyc-documents', `${userId}`),
    uploadFile(selfieFile, 'kyc-documents', `${userId}`),
  ])

  const { kycAutoApproveEnabled } = await getAppConfig()
  const status = kycAutoApproveEnabled ? 'APPROVED' : 'PENDING'

  await prisma.sellerKyc.upsert({
    where: { userId },
    create: { userId, idType, idDocUrl, selfieUrl, status },
    update: { idType, idDocUrl, selfieUrl, status, remarks: null },
  })

  if (kycAutoApproveEnabled) {
    await notifyUsers([
      {
        userId,
        title: 'KYC approved',
        message: 'Your seller KYC has been verified. You can now publish listings.',
      },
    ])
  } else {
    const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
    if (backendUsers.length > 0) {
      await notifyUsers(
        backendUsers.map((u) => ({
          userId: u.id,
          title: 'New KYC submission',
          message: `New KYC submission from ${session.user.name}.`,
        }))
      )
    }
  }

  revalidatePath('/dashboard/kyc')
  revalidatePath('/dashboard')
}
