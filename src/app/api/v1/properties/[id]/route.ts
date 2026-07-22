import { prisma } from '@/lib/prisma'
import { authenticateOptional } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import { recordPropertyView } from '@/lib/data/propertyViews'

/** Public — no auth required, so an anonymous visitor can view a listing.
 *  A token is read if present only to skip view-counting the owner's/agent's
 *  own views; anonymous views are always recorded. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticateOptional(req)
  const { id } = await ctx.params

  const property = await prisma.property.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true, email: true } }, agent: { select: { name: true } } },
  })
  if (!property) throw new ApiError('Property not found', 404)

  // Count genuine buyer interest only — don't inflate on the owner's/agent's own views.
  const isOwnSide = user != null && (user.id === property.sellerId || user.id === property.agentId)
  if (!isOwnSide) await recordPropertyView({ propertyId: id, userId: user?.id ?? null })

  return ok(propertyDTO(property))
})
