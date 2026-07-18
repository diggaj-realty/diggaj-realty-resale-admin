import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'

export const GET = withApi(async (req, ctx) => {
  await authenticate(req)
  const { id } = await ctx.params

  const property = await prisma.property.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true, email: true } }, agent: { select: { name: true } } },
  })
  if (!property) throw new ApiError('Property not found', 404)

  return ok(propertyDTO(property))
})
