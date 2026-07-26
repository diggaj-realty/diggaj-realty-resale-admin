import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import {
  createOrUpdateInterest,
  propertyInterestDTO,
  INTEREST_SOURCES,
  type InterestSource,
} from '@/lib/data/interests'

/** Property-scoped alias for `POST /api/v1/interests`, for callers that already
 *  have the property in hand (the "I'm Interested" button on a listing page).
 *  Identical behavior — same idempotency, same agent assignment, same
 *  notifications; the property comes from the path instead of the body. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER'])
  const { id: propertyId } = await ctx.params
  const body = await readJson<{ source?: string; buyerNote?: string }>(req)

  const source = String(body.source || 'GENERAL_INTEREST').trim().toUpperCase()
  if (!INTEREST_SOURCES.includes(source as InterestSource)) {
    throw new ApiError(`source must be one of: ${INTEREST_SOURCES.join(', ')}`, 400)
  }

  const result = await createOrUpdateInterest({
    propertyId,
    buyerId: user.id,
    buyerName: user.name,
    source: source as InterestSource,
    buyerNote: body.buyerNote ? String(body.buyerNote).trim() : null,
  })

  if ('error' in result) {
    if (result.error === 'PROPERTY_NOT_FOUND') throw new ApiError('Property not found', 404)
    throw new ApiError('This property is no longer available', 400)
  }

  const full = await prisma.propertyInterest.findUnique({
    where: { id: result.interest.id },
    include: {
      property: { select: { title: true, location: true, askingPrice: true, status: true } },
      buyer: { select: { name: true, email: true, phone: true } },
      agent: { select: { name: true, email: true, phone: true } },
    },
  })

  return ok(
    { ...propertyInterestDTO(full!), agentAssigned: result.agentAssigned },
    result.isNew ? 201 : 200
  )
})
