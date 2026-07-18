import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { kycDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  await authenticate(req, ['BACKEND'])
  const { id } = await ctx.params

  const body = await readJson<{ decision?: string }>(req)
  const decision = String(body.decision || '')
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new ApiError('decision must be APPROVED or REJECTED', 400)

  const kyc = await prisma.sellerKyc.update({ where: { id }, data: { status: decision } })

  await prisma.notification.create({
    data: {
      userId: kyc.userId,
      title: decision === 'APPROVED' ? 'KYC approved' : 'KYC rejected',
      message: decision === 'APPROVED'
        ? 'Your seller KYC has been verified. You can now publish listings.'
        : 'Your KYC submission was rejected. Please resubmit your documents.',
    },
  })

  return ok(kycDTO(kyc))
})
