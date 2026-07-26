import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import type { DealIdentityVerification } from '@prisma/client'

const METHODS = ['KYC_PROVIDER', 'AADHAAR_OTP', 'OTHER_COMPLIANT_METHOD'] as const

type VerificationWithUser = DealIdentityVerification & { user?: { name: string } | null }

function verificationDTO(v: VerificationWithUser) {
  return {
    id: v.id,
    dealId: v.dealId,
    userId: v.userId,
    userName: v.user?.name,
    method: v.method,
    status: v.status,
    providerReference: v.providerReference,
    remarks: v.remarks,
    verifiedAt: v.verifiedAt ? v.verifiedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }
}

/** Identity verification state for both parties on a deal.
 *
 *  Everyone involved can see whether each side is verified — that's a fact about
 *  the transaction's readiness, and both parties have a legitimate interest in
 *  knowing the other has been verified. What they can't see is anyone else's
 *  underlying documents; that's governed separately.
 */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isInvolved = deal.buyerId === user.id || deal.sellerId === user.id || deal.agentId === user.id
  if (!isStaff && !isInvolved) throw new ApiError('Forbidden', 403)

  const verifications = await prisma.dealIdentityVerification.findMany({
    where: { dealId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const buyer = verifications.find((v) => v.userId === deal.buyerId)
  const seller = verifications.find((v) => v.userId === deal.sellerId)

  return ok({
    verifications: verifications.map(verificationDTO),
    buyerVerified: buyer?.status === 'VERIFIED',
    sellerVerified: seller?.status === 'VERIFIED',
    // The gate the agreement stage depends on.
    bothVerified: buyer?.status === 'VERIFIED' && seller?.status === 'VERIFIED',
  })
})

/** Starts identity verification for the calling party.
 *
 *  A party may only ever start their *own* verification — one side cannot verify
 *  the other, and an agent cannot verify anybody. This creates the record in
 *  INITIATED; only the provider callback moves it to VERIFIED, because a claim
 *  of verified identity has to trace back to evidence outside this system.
 *
 *  Body: `{ method }`
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER'])
  const { id: dealId } = await ctx.params
  const body = await readJson<{ method?: string }>(req)

  const method = String(body.method || 'KYC_PROVIDER').trim().toUpperCase()
  if (!METHODS.includes(method as (typeof METHODS)[number])) {
    throw new ApiError(`method must be one of: ${METHODS.join(', ')}`, 400)
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  // Identity is verified for a party to the transaction — nobody else has an
  // identity to verify here.
  if (deal.buyerId !== user.id && deal.sellerId !== user.id) {
    throw new ApiError('Only the buyer or seller on this deal can verify their identity', 403)
  }

  const existing = await prisma.dealIdentityVerification.findUnique({
    where: { dealId_userId: { dealId, userId: user.id } },
  })
  if (existing?.status === 'VERIFIED') {
    throw new ApiError('Your identity is already verified for this deal', 400)
  }

  const verification = await prisma.dealIdentityVerification.upsert({
    where: { dealId_userId: { dealId, userId: user.id } },
    create: { dealId, userId: user.id, method, status: 'INITIATED' },
    // Re-initiating after a failure or expiry starts a fresh attempt.
    update: { method, status: 'INITIATED', remarks: null, providerReference: null },
    include: { user: { select: { name: true } } },
  })

  await recordAudit({
    action: 'IDENTITY_VERIFICATION_STARTED',
    actorId: user.id,
    entity: 'DealIdentityVerification',
    entityId: verification.id,
    meta: { dealId, method },
  })

  if (deal.agentId) {
    await notifyUsers([
      {
        userId: deal.agentId,
        title: 'Identity verification started',
        message: `${user.name} has started identity verification for ${deal.property.title}.`,
      },
    ])
  }

  return ok(verificationDTO(verification), 201)
})

/** Records the outcome of a verification attempt.
 *
 *  Staff-only, standing in for the provider's callback until one is wired up. The
 *  point of keeping this off the party's own endpoint is that VERIFIED must
 *  represent something checked externally, not something the user asserted about
 *  themselves. Neither party can verify the other, and neither can verify
 *  themselves here.
 *
 *  Body: `{ userId, status, providerReference?, remarks? }`
 */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params
  const body = await readJson<{
    userId?: string
    status?: string
    providerReference?: string
    remarks?: string
  }>(req)

  const targetUserId = String(body.userId || '').trim()
  const status = String(body.status || '').trim().toUpperCase()
  if (!targetUserId) throw new ApiError('userId is required', 400)
  if (!['VERIFIED', 'FAILED', 'EXPIRED'].includes(status)) {
    throw new ApiError('status must be one of: VERIFIED, FAILED, EXPIRED', 400)
  }
  if (status === 'FAILED' && !body.remarks?.trim()) {
    throw new ApiError('remarks is required when failing a verification — say why', 400)
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const verification = await prisma.dealIdentityVerification.findUnique({
    where: { dealId_userId: { dealId, userId: targetUserId } },
  })
  if (!verification) throw new ApiError('No verification has been started for that party', 404)

  const updated = await prisma.dealIdentityVerification.update({
    where: { id: verification.id },
    data: {
      status,
      providerReference: body.providerReference?.trim() || verification.providerReference,
      remarks: body.remarks?.trim() || null,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    },
    include: { user: { select: { name: true } } },
  })

  await recordAudit({
    action: status === 'VERIFIED' ? 'IDENTITY_VERIFIED' : 'IDENTITY_VERIFICATION_FAILED',
    actorId: user.id,
    entity: 'DealIdentityVerification',
    entityId: verification.id,
    meta: { dealId, targetUserId, status, providerReference: body.providerReference ?? null },
  })

  await notifyUsers([
    {
      userId: targetUserId,
      title: status === 'VERIFIED' ? 'Identity verified' : 'Identity verification unsuccessful',
      message:
        status === 'VERIFIED'
          ? `Your identity has been verified for ${deal.property.title}.`
          : `Identity verification for ${deal.property.title} was not successful. ${body.remarks?.trim() ?? ''}`.trim(),
    },
  ])

  return ok(verificationDTO(updated))
})
