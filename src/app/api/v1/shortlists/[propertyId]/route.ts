import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi } from '@/lib/api/http'

/** Remove a property from the buyer's shortlist. Idempotent — 200 even if it
 *  wasn't shortlisted, so the client can treat "unshortlist" as fire-and-forget. */
export const DELETE = withApi(async (req, { params }) => {
  const user = await authenticate(req, ['BUYER'])
  const { propertyId } = await params

  await prisma.shortlist.deleteMany({ where: { userId: user.id, propertyId } })

  return ok({ propertyId, shortlisted: false })
})
