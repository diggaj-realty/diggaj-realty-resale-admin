import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { agreementDTO } from '@/lib/data/agreements'

const INCLUDE = {
  signatures: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' as const } },
}

/** Agreements for a deal, newest version first, each with its signature state. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isInvolved = deal.buyerId === user.id || deal.sellerId === user.id || deal.agentId === user.id
  if (!isStaff && !isInvolved) throw new ApiError('Forbidden', 403)

  const agreements = await prisma.dealAgreement.findMany({
    where: { dealId },
    orderBy: { version: 'desc' },
    include: INCLUDE,
  })

  return ok(agreements.map(agreementDTO))
})

/** Generates an agreement for the deal.
 *
 *  Gated on the prerequisites being genuinely met — every required document
 *  approved, and both parties' identities verified. Generating a contract for
 *  parties who haven't been verified, against unchecked paperwork, would put a
 *  signable document in front of people on the strength of nothing.
 *
 *  Each call creates a new version rather than editing an existing one, so a
 *  signed agreement is never mutated: revised terms mean version 2 and a fresh
 *  signature round. Any earlier unsigned draft is cancelled so there's one live
 *  document to sign.
 *
 *  Body: `{ documentUrl?, checksum? }` — the generated file, once a generator or
 *  template service produces one.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params
  const body = await readJson<{ documentUrl?: string; checksum?: string }>(req)

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      property: { select: { title: true } },
      documents: { select: { status: true } },
      identityVerifications: { select: { userId: true, status: true } },
    },
  })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (user.role === 'AGENT' && deal.agentId !== user.id) {
    throw new ApiError('This deal is assigned to another agent', 403)
  }
  if (deal.status === 'CLOSED') throw new ApiError('This deal is already closed', 400)

  const unapprovedDocs = deal.documents.filter((d) => d.status !== 'APPROVED').length
  if (unapprovedDocs > 0) {
    throw new ApiError(
      `${unapprovedDocs} document${unapprovedDocs === 1 ? '' : 's'} still need approval before an agreement can be generated`,
      400
    )
  }

  const buyerVerified = deal.identityVerifications.some(
    (v) => v.userId === deal.buyerId && v.status === 'VERIFIED'
  )
  const sellerVerified = deal.identityVerifications.some(
    (v) => v.userId === deal.sellerId && v.status === 'VERIFIED'
  )
  if (!buyerVerified || !sellerVerified) {
    throw new ApiError(
      `Identity verification is incomplete — ${!buyerVerified ? 'buyer' : 'seller'} is not yet verified`,
      400
    )
  }

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.dealAgreement.findFirst({
      where: { dealId },
      orderBy: { version: 'desc' },
    })

    // A fully-executed agreement is the end state; superseding it would mean
    // re-opening a signed contract, which is a decision for a human, not an
    // implicit side effect of hitting this endpoint again.
    if (latest?.status === 'FULLY_EXECUTED') {
      throw new ApiError('This deal already has a fully executed agreement', 409)
    }

    // Retire any live-but-unsigned draft so only one document is signable.
    if (latest && latest.status !== 'CANCELLED' && latest.status !== 'EXPIRED') {
      await tx.dealAgreement.update({ where: { id: latest.id }, data: { status: 'CANCELLED' } })
    }

    const version = (latest?.version ?? 0) + 1

    const agreement = await tx.dealAgreement.create({
      data: {
        dealId,
        version,
        status: body.documentUrl ? 'READY_FOR_SIGNATURE' : 'DRAFT',
        documentUrl: body.documentUrl?.trim() || null,
        checksum: body.checksum?.trim() || null,
        agreedAmount: deal.agreedPrice,
        createdById: user.id,
      },
    })

    // One signature slot per party, created up front so each side's state is
    // tracked separately and neither can stand in for the other.
    await tx.dealSignature.createMany({
      data: [
        { agreementId: agreement.id, userId: deal.buyerId, role: 'BUYER', status: 'PENDING' },
        { agreementId: agreement.id, userId: deal.sellerId, role: 'SELLER', status: 'PENDING' },
      ],
    })

    await recordAudit(
      {
        action: 'AGREEMENT_CREATED',
        actorId: user.id,
        entity: 'DealAgreement',
        entityId: agreement.id,
        meta: { dealId, version, supersededVersion: latest?.version ?? null },
      },
      tx
    )

    return agreement
  })

  if (created.status === 'READY_FOR_SIGNATURE') {
    await notifyUsers(
      [deal.buyerId, deal.sellerId].map((userId) => ({
        userId,
        title: 'Agreement ready to sign',
        message: `The agreement for ${deal.property.title} is ready for your signature.`,
      }))
    )
  }

  const full = await prisma.dealAgreement.findUnique({ where: { id: created.id }, include: INCLUDE })
  return ok(agreementDTO(full!), 201)
})
