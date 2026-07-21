import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { getPropertyViewStats } from '@/lib/data/propertyViews'

/** View analytics for a property. Restricted to the property's seller/agent, or
 *  ADMIN/BACKEND. Buyers can't inspect another listing's engagement. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req)
  const { id } = await ctx.params

  const property = await prisma.property.findUnique({
    where: { id },
    select: { sellerId: true, agentId: true, viewCount: true },
  })
  if (!property) throw new ApiError('Property not found', 404)

  const allowed =
    user.role === 'ADMIN' ||
    user.role === 'BACKEND' ||
    user.id === property.sellerId ||
    user.id === property.agentId
  if (!allowed) throw new ApiError('Forbidden', 403)

  const stats = await getPropertyViewStats(id)
  return ok({ propertyId: id, viewCount: property.viewCount, ...stats })
})
