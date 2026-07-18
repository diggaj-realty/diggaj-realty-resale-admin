import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  await authenticate(req, ['BACKEND'])
  const { id } = await ctx.params

  const body = await readJson<{ decision?: string }>(req)
  const decision = String(body.decision || '')
  if (!['LIVE', 'REJECTED'].includes(decision)) throw new ApiError('decision must be LIVE or REJECTED', 400)

  const property = await prisma.property.update({
    where: { id },
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

  return ok(propertyDTO(property))
})
