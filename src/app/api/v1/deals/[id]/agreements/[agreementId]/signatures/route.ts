import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { agreementDTO, deriveAgreementStatus, signatureDTO } from '@/lib/data/agreements'

/** Signature actions on one agreement version.
 *
 *  The boundary here mirrors payments: the person doing the thing may only say
 *  they've *started*, never that it's done.
 *
 *    - `initiate` — the buyer or seller, for their own signature only. Means "I
 *      am going off to the signing provider", not "I have signed".
 *    - `complete` — staff only, standing in for the provider's verified callback
 *      until one is wired up. This is the only path to SIGNED.
 *
 *  An agent may set an agreement up and chase both parties, but there is
 *  deliberately no action that lets them (or either party) mark a signature
 *  complete. "The user clicked sign" is not evidence that a legally binding
 *  signature exists — only the provider can attest to that.
 *
 *  Body: `{ action, provider?, providerReference? }`
 */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId, agreementId } = await ctx.params
  const body = await readJson<{
    action?: string
    userId?: string
    provider?: string
    providerReference?: string
  }>(req)
  const action = String(body.action || '').trim()

  if (action !== 'initiate' && action !== 'complete') {
    throw new ApiError('action must be initiate or complete', 400)
  }

  const agreement = await prisma.dealAgreement.findUnique({
    where: { id: agreementId },
    include: {
      signatures: true,
      deal: { include: { property: { select: { title: true } } } },
    },
  })
  if (!agreement || agreement.dealId !== dealId) throw new ApiError('Agreement not found', 404)

  const deal = agreement.deal
  if (agreement.status === 'CANCELLED' || agreement.status === 'EXPIRED') {
    throw new ApiError('This agreement version is no longer active', 400)
  }
  if (!agreement.documentUrl) {
    throw new ApiError('This agreement has no document to sign yet', 400)
  }

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'

  // ── A party starts their own signing ──
  if (action === 'initiate') {
    const signature = agreement.signatures.find((s) => s.userId === user.id)
    if (!signature) {
      throw new ApiError('Only the buyer or seller on this agreement can sign it', 403)
    }
    if (signature.status === 'SIGNED') throw new ApiError('You have already signed this agreement', 400)

    const updated = await prisma.dealSignature.update({
      where: { id: signature.id },
      data: {
        status: 'INITIATED',
        provider: body.provider?.trim() || signature.provider,
      },
      include: { user: { select: { name: true } } },
    })

    const refreshed = await prisma.dealSignature.findMany({ where: { agreementId } })
    await prisma.dealAgreement.update({
      where: { id: agreementId },
      data: { status: deriveAgreementStatus(agreement.status, refreshed) },
    })

    await recordAudit({
      action: 'SIGNATURE_REQUESTED',
      actorId: user.id,
      entity: 'DealSignature',
      entityId: signature.id,
      meta: { agreementId, dealId, role: signature.role },
    })

    return ok(signatureDTO(updated))
  }

  // ── Provider-verified completion ──
  // Staff-only on purpose. When a real signing provider is integrated its
  // webhook takes this path; until then a human confirms against the provider's
  // own record. Either way, the assertion comes from outside the signer.
  if (!isStaff) {
    throw new ApiError(
      'A signature can only be completed from a verified provider confirmation, not by a party or agent',
      403
    )
  }

  const targetUserId = String(body.userId || '').trim()
  if (!targetUserId) throw new ApiError('userId is required to complete a signature', 400)
  if (!body.providerReference?.trim()) {
    // Without a provider reference there's nothing tying SIGNED to evidence.
    throw new ApiError('providerReference is required to complete a signature', 400)
  }

  const signature = agreement.signatures.find((s) => s.userId === targetUserId)
  if (!signature) throw new ApiError('That party has no signature slot on this agreement', 404)
  if (signature.status === 'SIGNED') throw new ApiError('That signature is already complete', 400)

  const result = await prisma.$transaction(async (tx) => {
    await tx.dealSignature.update({
      where: { id: signature.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        provider: body.provider?.trim() || signature.provider,
        providerReference: body.providerReference!.trim(),
      },
    })

    const all = await tx.dealSignature.findMany({ where: { agreementId } })
    const nextStatus = deriveAgreementStatus(agreement.status, all)
    await tx.dealAgreement.update({ where: { id: agreementId }, data: { status: nextStatus } })

    await recordAudit(
      {
        action: 'SIGNATURE_COMPLETED',
        actorId: user.id,
        entity: 'DealSignature',
        entityId: signature.id,
        meta: {
          agreementId,
          dealId,
          role: signature.role,
          signerId: targetUserId,
          providerReference: body.providerReference!.trim(),
          agreementStatus: nextStatus,
        },
      },
      tx
    )

    return nextStatus
  })

  // Tell the other side — either that it's their turn, or that it's done.
  const otherPartyId = signature.role === 'BUYER' ? deal.sellerId : deal.buyerId
  if (result === 'FULLY_EXECUTED') {
    await notifyUsers(
      [deal.buyerId, deal.sellerId, ...(deal.agentId ? [deal.agentId] : [])].map((userId) => ({
        userId,
        title: 'Agreement fully executed',
        message: `The agreement for ${deal.property.title} has been signed by both parties.`,
      }))
    )
  } else {
    await notifyUsers([
      {
        userId: otherPartyId,
        title: 'Agreement awaiting your signature',
        message: `The other party has signed the agreement for ${deal.property.title}. Yours is outstanding.`,
      },
    ])
  }

  const full = await prisma.dealAgreement.findUnique({
    where: { id: agreementId },
    include: {
      signatures: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  })
  return ok(agreementDTO(full!))
})
