import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'

const REQUESTABLE_PLANS = ['ELITE'] as const

/** Seller requests to promote one of their own properties to a higher plan.
 *  This does NOT change `plan` — it only sets `requestedPlan` and notifies
 *  staff, who approve (plan becomes the requested one) or reject (stays as
 *  is) via the existing dashboard plan control. No payment is collected
 *  here yet; when billing is wired up, it slots in right where this
 *  endpoint currently sets `requestedPlan` — charge first, then set
 *  `requestedPlan` (or skip the approval step and set `plan` directly once
 *  payment itself is the gate instead of staff approval). */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER'])
  const { id: propertyId } = await ctx.params

  const body = await readJson<{ plan?: string }>(req)
  const plan = String(body.plan || '').trim().toUpperCase()
  if (!REQUESTABLE_PLANS.includes(plan as (typeof REQUESTABLE_PLANS)[number])) {
    throw new ApiError(`plan must be one of: ${REQUESTABLE_PLANS.join(', ')}`, 400)
  }

  const property = await prisma.property.findUnique({ where: { id: propertyId } })
  if (!property) throw new ApiError('Property not found', 404)
  if (property.sellerId !== user.id) throw new ApiError('Forbidden', 403)
  if (property.plan === plan) throw new ApiError(`This property is already on the ${plan} plan`, 400)
  if (property.requestedPlan === plan) throw new ApiError('This upgrade is already pending approval', 400)

  const updated = await prisma.property.update({
    where: { id: propertyId },
    data: { requestedPlan: plan },
    include: { photos: true },
  })

  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'BACKEND'] } }, select: { id: true } })
  await notifyUsers(
    staff.map((s) => ({
      userId: s.id,
      title: 'Plan upgrade requested',
      message: `${property.title} — seller requested ${plan}.`,
    }))
  )

  return ok(propertyDTO(updated))
})
