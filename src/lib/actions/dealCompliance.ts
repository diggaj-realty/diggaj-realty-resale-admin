'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'
import { deriveAgreementStatus } from '@/lib/data/agreements'

/** Dashboard-side document-request review, identity verification and agreement
 *  handling.
 *
 *  Two boundaries are preserved exactly as in the API, because they're the point
 *  of these features rather than incidental checks:
 *
 *  - Nobody can verify their own or anyone else's identity from here; reaching
 *    VERIFIED is a staff act standing in for a provider callback, and it needs a
 *    provider reference.
 *  - No action here can mark a signature SIGNED on a party's behalf without a
 *    provider reference. An agent may chase signing; they cannot declare it done.
 */

async function requireDealStaff(dealId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new Error('Deal not found')

  const { id: userId, role } = session.user
  const isAssignedAgent = role === 'AGENT' && deal.agentId === userId
  const isStaff = role === 'BACKEND' || role === 'ADMIN'
  if (!isAssignedAgent && !isStaff) throw new Error('Unauthorized')

  return { deal, userId, role, isStaff }
}

function revalidateDeal(dealId: string) {
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/accepted-offers')
}

// ── Cross-party document requests ──────────────────────────────────────────

/** The agent's decision on one party's request for the other's document. */
export async function reviewDocumentRequest(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const requestId = String(formData.get('requestId'))
  const action = String(formData.get('action'))
  const remarks = String(formData.get('remarks') || '').trim()
  const documentId = String(formData.get('documentId') || '').trim()

  const { deal, userId } = await requireDealStaff(dealId)

  const request = await prisma.documentRequest.findUnique({ where: { id: requestId } })
  if (!request || request.dealId !== dealId) throw new Error('Document request not found')
  if (request.status !== 'PENDING_AGENT_REVIEW' && request.status !== 'FORWARDED_TO_OWNER') {
    throw new Error('This request has already been resolved')
  }

  if (action === 'reject') {
    // A refusal with no reason tells the requester nothing and invites them to
    // simply ask again.
    if (!remarks) throw new Error('Add a reason when declining a request')
    await prisma.documentRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewRemarks: remarks, agentId: deal.agentId ?? userId },
    })
    await recordAudit({
      action: 'DOCUMENT_REQUEST_REJECTED',
      actorId: userId,
      entity: 'DocumentRequest',
      entityId: requestId,
      meta: { remarks },
    })
    await notifyUsers([
      {
        userId: request.requestedById,
        title: 'Document request declined',
        message: `Your request for "${request.docType}" was declined: ${remarks}`,
      },
    ])
  } else if (action === 'forward') {
    const requiredFrom = request.requestedFromId === deal.buyerId ? 'BUYER' : 'SELLER'
    await prisma.$transaction(async (tx) => {
      const doc = await tx.dealDocument.create({
        data: {
          dealId,
          docType: request.docType,
          requiredFrom,
          ownerId: request.requestedFromId,
          status: 'PENDING',
          remarks: request.reason,
        },
      })
      await tx.documentRequest.update({
        where: { id: requestId },
        data: {
          status: 'FORWARDED_TO_OWNER',
          sourceDocumentId: doc.id,
          agentId: deal.agentId ?? userId,
          reviewRemarks: remarks || null,
        },
      })
      await recordAudit(
        {
          action: 'DOCUMENT_REQUEST_APPROVED',
          actorId: userId,
          entity: 'DocumentRequest',
          entityId: requestId,
          meta: { resolution: 'FORWARDED_TO_OWNER', documentId: doc.id },
        },
        tx
      )
    })
    await notifyUsers([
      {
        userId: request.requestedFromId,
        title: 'Document required',
        message: `"${request.docType}" is needed for ${deal.property.title}. Please upload it.`,
      },
      {
        userId: request.requestedById,
        title: 'Document request forwarded',
        message: `Your request for "${request.docType}" has been passed to the other party.`,
      },
    ])
  } else if (action === 'shareExisting') {
    if (!documentId) throw new Error('Choose which approved document to share')
    const document = await prisma.dealDocument.findUnique({ where: { id: documentId } })
    if (!document || document.dealId !== dealId) throw new Error('Document not found on this deal')
    // Sharing an unreviewed file passes on something nobody has checked; a
    // rejected one is known to be wrong.
    if (document.status !== 'APPROVED') throw new Error('Only an approved document can be shared')
    if (!document.fileUrl) throw new Error('That document has no uploaded file to share')
    if (document.ownerId && document.ownerId !== request.requestedFromId) {
      throw new Error('That document does not belong to the party this request was made to')
    }

    await prisma.$transaction(async (tx) => {
      // Grants access to the existing file rather than copying it, so the owner
      // stays the owner and there's one auditable copy.
      await tx.documentAccessGrant.upsert({
        where: {
          documentId_grantedToId_dealId: { documentId, grantedToId: request.requestedById, dealId },
        },
        create: {
          documentId,
          dealId,
          grantedToId: request.requestedById,
          grantedById: userId,
          purpose: `Shared in response to request for "${request.docType}"`,
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE', revokedAt: null, grantedById: userId },
      })
      await tx.documentRequest.update({
        where: { id: requestId },
        data: {
          status: 'EXISTING_DOCUMENT_SHARED',
          sourceDocumentId: documentId,
          agentId: deal.agentId ?? userId,
          reviewRemarks: remarks || null,
        },
      })
      await recordAudit(
        {
          action: 'DOCUMENT_EXISTING_FILE_SHARED',
          actorId: userId,
          entity: 'DealDocument',
          entityId: documentId,
          meta: { requestId, grantedToId: request.requestedById },
        },
        tx
      )
      await recordAudit(
        {
          action: 'DOCUMENT_ACCESS_GRANTED',
          actorId: userId,
          entity: 'DealDocument',
          entityId: documentId,
          meta: { grantedToId: request.requestedById, dealId },
        },
        tx
      )
    })
    await notifyUsers([
      {
        userId: request.requestedById,
        title: 'Document shared with you',
        message: `"${document.docType}" has been shared with you.`,
      },
      {
        userId: request.requestedFromId,
        title: 'Your document was shared',
        message: `Your approved "${document.docType}" was shared with the other party.`,
      },
    ])
  } else {
    throw new Error('Invalid action')
  }

  revalidateDeal(dealId)
}

/** Withdraws access previously granted to a counterparty. */
export async function revokeDocumentAccess(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const grantId = String(formData.get('grantId'))

  const { userId } = await requireDealStaff(dealId)

  const grant = await prisma.documentAccessGrant.findUnique({ where: { id: grantId } })
  if (!grant || grant.dealId !== dealId) throw new Error('Access grant not found')
  if (grant.status === 'REVOKED') throw new Error('That access has already been revoked')

  await prisma.documentAccessGrant.update({
    where: { id: grantId },
    data: { status: 'REVOKED', revokedAt: new Date() },
  })
  await recordAudit({
    action: 'DOCUMENT_ACCESS_REVOKED',
    actorId: userId,
    entity: 'DealDocument',
    entityId: grant.documentId,
    meta: { grantId, grantedToId: grant.grantedToId },
  })

  revalidateDeal(dealId)
}

// ── Identity verification ──────────────────────────────────────────────────

/** Records the outcome of a party's identity check.
 *
 *  Staff-only, standing in for the provider's callback, and VERIFIED requires a
 *  provider reference — otherwise nothing ties the claim to evidence outside this
 *  system. Note this deliberately cannot be used by the party themselves or by an
 *  agent, and neither party can verify the other. */
export async function reviewIdentityVerification(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN') {
    throw new Error('Only backend or admin can record an identity verification outcome')
  }

  const dealId = String(formData.get('dealId'))
  const targetUserId = String(formData.get('userId'))
  const status = String(formData.get('status') || '').toUpperCase()
  const providerReference = String(formData.get('providerReference') || '').trim()
  const remarks = String(formData.get('remarks') || '').trim()

  if (!['VERIFIED', 'FAILED', 'EXPIRED'].includes(status)) throw new Error('Invalid status')
  if (status === 'VERIFIED' && !providerReference) {
    throw new Error('A provider reference is required to mark an identity verified')
  }
  if (status === 'FAILED' && !remarks) throw new Error('Add a reason when failing a verification')

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new Error('Deal not found')
  if (targetUserId !== deal.buyerId && targetUserId !== deal.sellerId) {
    throw new Error('That user is not a party to this deal')
  }

  await prisma.dealIdentityVerification.upsert({
    where: { dealId_userId: { dealId, userId: targetUserId } },
    create: {
      dealId,
      userId: targetUserId,
      method: 'KYC_PROVIDER',
      status,
      providerReference: providerReference || null,
      remarks: remarks || null,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    },
    update: {
      status,
      providerReference: providerReference || null,
      remarks: remarks || null,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    },
  })

  await recordAudit({
    action: status === 'VERIFIED' ? 'IDENTITY_VERIFIED' : 'IDENTITY_VERIFICATION_FAILED',
    actorId: session.user.id,
    entity: 'DealIdentityVerification',
    entityId: dealId,
    meta: { targetUserId, status, providerReference: providerReference || null },
  })

  await notifyUsers([
    {
      userId: targetUserId,
      title: status === 'VERIFIED' ? 'Identity verified' : 'Identity verification unsuccessful',
      message:
        status === 'VERIFIED'
          ? `Your identity has been verified for ${deal.property.title}.`
          : `Identity verification for ${deal.property.title} was not successful. ${remarks}`.trim(),
    },
  ])

  revalidateDeal(dealId)
}

// ── Agreement & signing ────────────────────────────────────────────────────

/** Generates the agreement, gated on documents being approved and both
 *  identities verified — a signable contract shouldn't exist for unverified
 *  parties against unchecked paperwork. Creates a new version rather than editing
 *  an existing one, so a signed agreement is never mutated. */
export async function generateAgreement(formData: FormData) {
  const dealId = String(formData.get('dealId'))
  const documentUrl = String(formData.get('documentUrl') || '').trim()

  const { deal, userId } = await requireDealStaff(dealId)
  if (deal.status === 'CLOSED') throw new Error('This deal is already closed')

  const [documents, verifications] = await Promise.all([
    prisma.dealDocument.findMany({ where: { dealId }, select: { status: true } }),
    prisma.dealIdentityVerification.findMany({ where: { dealId }, select: { userId: true, status: true } }),
  ])

  const unapproved = documents.filter((d) => d.status !== 'APPROVED').length
  if (unapproved > 0) throw new Error(`${unapproved} document(s) still need approval first`)

  const buyerOk = verifications.some((v) => v.userId === deal.buyerId && v.status === 'VERIFIED')
  const sellerOk = verifications.some((v) => v.userId === deal.sellerId && v.status === 'VERIFIED')
  if (!buyerOk || !sellerOk) {
    throw new Error(`Identity verification incomplete — ${!buyerOk ? 'buyer' : 'seller'} not verified`)
  }

  await prisma.$transaction(async (tx) => {
    const latest = await tx.dealAgreement.findFirst({ where: { dealId }, orderBy: { version: 'desc' } })
    if (latest?.status === 'FULLY_EXECUTED') {
      throw new Error('This deal already has a fully executed agreement')
    }
    if (latest && latest.status !== 'CANCELLED' && latest.status !== 'EXPIRED') {
      await tx.dealAgreement.update({ where: { id: latest.id }, data: { status: 'CANCELLED' } })
    }

    const agreement = await tx.dealAgreement.create({
      data: {
        dealId,
        version: (latest?.version ?? 0) + 1,
        status: documentUrl ? 'READY_FOR_SIGNATURE' : 'DRAFT',
        documentUrl: documentUrl || null,
        agreedAmount: deal.agreedPrice,
        createdById: userId,
      },
    })
    // One slot per party, so each side's state is tracked separately and neither
    // can stand in for the other.
    await tx.dealSignature.createMany({
      data: [
        { agreementId: agreement.id, userId: deal.buyerId, role: 'BUYER', status: 'PENDING' },
        { agreementId: agreement.id, userId: deal.sellerId, role: 'SELLER', status: 'PENDING' },
      ],
    })
    await recordAudit(
      {
        action: 'AGREEMENT_CREATED',
        actorId: userId,
        entity: 'DealAgreement',
        entityId: agreement.id,
        meta: { dealId, version: agreement.version },
      },
      tx
    )
  })

  if (documentUrl) {
    await notifyUsers(
      [deal.buyerId, deal.sellerId].map((uid) => ({
        userId: uid,
        title: 'Agreement ready to sign',
        message: `The agreement for ${deal.property.title} is ready for your signature.`,
      }))
    )
  }

  revalidateDeal(dealId)
}

/** Records a completed signature from the provider's confirmation.
 *
 *  Staff-only and requires a provider reference: "the user clicked sign" is not
 *  evidence a legally binding signature exists, so an agent has no path to
 *  marking this done. The agreement's own status is derived from the signature
 *  rows, so FULLY_EXECUTED can only happen when both genuinely say SIGNED. */
export async function recordSignature(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'BACKEND' && session.user.role !== 'ADMIN') {
    throw new Error('A signature can only be completed from a verified provider confirmation')
  }

  const dealId = String(formData.get('dealId'))
  const agreementId = String(formData.get('agreementId'))
  const targetUserId = String(formData.get('userId'))
  const provider = String(formData.get('provider') || '').trim()
  const providerReference = String(formData.get('providerReference') || '').trim()

  if (!providerReference) throw new Error('A provider reference is required to complete a signature')

  const agreement = await prisma.dealAgreement.findUnique({
    where: { id: agreementId },
    include: { signatures: true, deal: { include: { property: { select: { title: true } } } } },
  })
  if (!agreement || agreement.dealId !== dealId) throw new Error('Agreement not found')
  if (agreement.status === 'CANCELLED' || agreement.status === 'EXPIRED') {
    throw new Error('This agreement version is no longer active')
  }

  const signature = agreement.signatures.find((s) => s.userId === targetUserId)
  if (!signature) throw new Error('That party has no signature slot on this agreement')
  if (signature.status === 'SIGNED') throw new Error('That signature is already complete')

  const nextStatus = await prisma.$transaction(async (tx) => {
    await tx.dealSignature.update({
      where: { id: signature.id },
      data: { status: 'SIGNED', signedAt: new Date(), provider: provider || null, providerReference },
    })
    const all = await tx.dealSignature.findMany({ where: { agreementId } })
    const derived = deriveAgreementStatus(agreement.status, all)
    await tx.dealAgreement.update({ where: { id: agreementId }, data: { status: derived } })
    await recordAudit(
      {
        action: 'SIGNATURE_COMPLETED',
        actorId: session.user.id,
        entity: 'DealSignature',
        entityId: signature.id,
        meta: { agreementId, dealId, signerId: targetUserId, providerReference, agreementStatus: derived },
      },
      tx
    )
    return derived
  })

  const deal = agreement.deal
  if (nextStatus === 'FULLY_EXECUTED') {
    await notifyUsers(
      [deal.buyerId, deal.sellerId, ...(deal.agentId ? [deal.agentId] : [])].map((uid) => ({
        userId: uid,
        title: 'Agreement fully executed',
        message: `The agreement for ${deal.property.title} has been signed by both parties.`,
      }))
    )
  } else {
    await notifyUsers([
      {
        userId: signature.role === 'BUYER' ? deal.sellerId : deal.buyerId,
        title: 'Agreement awaiting your signature',
        message: `The other party has signed the agreement for ${deal.property.title}.`,
      },
    ])
  }

  revalidateDeal(dealId)
}
