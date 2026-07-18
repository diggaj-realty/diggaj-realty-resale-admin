import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { kycDTO } from '@/lib/api/dto'

/** Seller's own KYC status — null if never submitted. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER'])
  const kyc = await prisma.sellerKyc.findUnique({ where: { userId: user.id } })
  return ok(kyc ? kycDTO(kyc) : null)
})

/** Submit (or resubmit) KYC. Expects idDocUrl/selfieUrl already uploaded via
 *  POST /api/v1/uploads (bucket=kyc-documents). */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER'])
  const body = await readJson<{ idType?: string; idDocUrl?: string; selfieUrl?: string }>(req)

  const idType = String(body.idType || '')
  const idDocUrl = String(body.idDocUrl || '')
  const selfieUrl = String(body.selfieUrl || '')

  if (!idType) throw new ApiError('idType is required', 400)
  if (!idDocUrl) throw new ApiError('idDocUrl is required (upload it first via /api/v1/uploads)', 400)
  if (!selfieUrl) throw new ApiError('selfieUrl is required (upload it first via /api/v1/uploads)', 400)

  const kyc = await prisma.sellerKyc.upsert({
    where: { userId: user.id },
    create: { userId: user.id, idType, idDocUrl, selfieUrl, status: 'PENDING' },
    update: { idType, idDocUrl, selfieUrl, status: 'PENDING', remarks: null },
  })

  const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
  if (backendUsers.length > 0) {
    await prisma.notification.createMany({
      data: backendUsers.map((u) => ({
        userId: u.id,
        title: 'New KYC submission',
        message: `New KYC submission from ${user.name}.`,
      })),
    })
  }

  return ok(kycDTO(kyc), 201)
})
