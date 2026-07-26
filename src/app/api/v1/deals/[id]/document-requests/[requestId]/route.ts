import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { documentRequestDTO, findShareableDocuments } from '@/lib/data/documentRequests'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

const INCLUDE = {
  requestedBy: { select: { name: true } },
  requestedFrom: { select: { name: true } },
  agent: { select: { name: true } },
  sourceDocument: { select: { id: true, docType: true, status: true } },
}

type Action = 'reject' | 'forward' | 'shareExisting' | 'cancel'
const ACTIONS: Action[] = ['reject', 'forward', 'shareExisting', 'cancel']

/** The request, plus — for the reviewing agent — what they could share instead of
 *  asking for a fresh upload. Surfacing already-approved documents here is what
 *  makes "share existing" a real option rather than something the agent has to
 *  go hunting for. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId, requestId } = await ctx.params

  const request = await prisma.documentRequest.findUnique({ where: { id: requestId }, include: INCLUDE })
  if (!request || request.dealId !== dealId) throw new ApiError('Document request not found', 404)

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isAgent = deal.agentId === user.id
  const isInvolved = request.requestedById === user.id || request.requestedFromId === user.id
  if (!isStaff && !isAgent && !isInvolved) throw new ApiError('Forbidden', 403)

  const dto = documentRequestDTO(request)
  if (!isStaff && !isAgent) return ok(dto)

  const shareable = await findShareableDocuments({
    dealId,
    ownerId: request.requestedFromId,
    docType: request.docType,
  })
  return ok({
    ...dto,
    shareableDocuments: shareable.map((d) => ({
      id: d.id,
      docType: d.docType,
      status: d.status,
      updatedAt: d.updatedAt.toISOString(),
    })),
  })
})

/** The agent's decision on a cross-party request.
 *
 *  - `reject` — refuse it. A reason is mandatory: a silent refusal tells the
 *    requester nothing and invites them to just ask again.
 *  - `forward` — legitimate, and nothing suitable exists yet. Creates a
 *    DealDocument owned by the other party for them to upload against.
 *  - `shareExisting` — the owner already has an approved document that answers
 *    this. Grants access to that file; does not copy it, so the owner stays the
 *    owner and there's one auditable copy.
 *  - `cancel` — withdrawn by the requester.
 *
 *  Body: `{ action, remarks?, documentId? }`
 */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId, requestId } = await ctx.params
  const body = await readJson<{ action?: string; remarks?: string; documentId?: string }>(req)
  const action = String(body.action || '').trim() as Action

  if (!ACTIONS.includes(action)) throw new ApiError(`action must be one of: ${ACTIONS.join(', ')}`, 400)

  const request = await prisma.documentRequest.findUnique({ where: { id: requestId } })
  if (!request || request.dealId !== dealId) throw new ApiError('Document request not found', 404)

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isAgent = deal.agentId === user.id
  const isRequester = request.requestedById === user.id

  if (request.status !== 'PENDING_AGENT_REVIEW' && request.status !== 'FORWARDED_TO_OWNER') {
    throw new ApiError('This request has already been resolved', 400)
  }

  // ── Requester withdraws ──
  if (action === 'cancel') {
    if (!isRequester && !isStaff) throw new ApiError('Only the requester or staff can cancel a request', 403)
    await prisma.documentRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } })
    await recordAudit({
      action: 'DOCUMENT_REQUEST_REJECTED',
      actorId: user.id,
      entity: 'DocumentRequest',
      entityId: requestId,
      meta: { resolution: 'CANCELLED_BY_REQUESTER' },
    })
    const full = await prisma.documentRequest.findUnique({ where: { id: requestId }, include: INCLUDE })
    return ok(documentRequestDTO(full!))
  }

  // Everything else is the review decision, which belongs to the agent.
  if (!isAgent && !isStaff) {
    throw new ApiError('Only the assigned agent or staff can review a document request', 403)
  }

  if (action === 'reject') {
    const remarks = String(body.remarks || '').trim()
    // A rejection without a reason is not a decision the requester can act on.
    if (!remarks) throw new ApiError('remarks is required when rejecting a request — say why', 400)

    await prisma.documentRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewRemarks: remarks, agentId: deal.agentId ?? user.id },
    })
    await recordAudit({
      action: 'DOCUMENT_REQUEST_REJECTED',
      actorId: user.id,
      entity: 'DocumentRequest',
      entityId: requestId,
      meta: { remarks },
    })
    await notifyUsers([
      {
        userId: request.requestedById,
        title: 'Document request declined',
        message: `Your request for "${request.docType}" on ${deal.property.title} was declined: ${remarks}`,
      },
    ])
    const full = await prisma.documentRequest.findUnique({ where: { id: requestId }, include: INCLUDE })
    return ok(documentRequestDTO(full!))
  }

  if (action === 'forward') {
    // Creates the requirement against the owner. Only now does the other party
    // learn anything about this request.
    const requiredFrom = request.requestedFromId === deal.buyerId ? 'BUYER' : 'SELLER'
    const created = await prisma.$transaction(async (tx) => {
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
          agentId: deal.agentId ?? user.id,
          reviewRemarks: body.remarks?.trim() || null,
        },
      })
      await recordAudit(
        {
          action: 'DOCUMENT_REQUEST_APPROVED',
          actorId: user.id,
          entity: 'DocumentRequest',
          entityId: requestId,
          meta: { resolution: 'FORWARDED_TO_OWNER', documentId: doc.id, requiredFrom },
        },
        tx
      )
      return doc
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

    const full = await prisma.documentRequest.findUnique({ where: { id: requestId }, include: INCLUDE })
    return ok({ ...documentRequestDTO(full!), createdDocumentId: created.id })
  }

  // ── shareExisting ──
  const documentId = String(body.documentId || '').trim()
  if (!documentId) throw new ApiError('documentId is required when sharing an existing document', 400)

  const document = await prisma.dealDocument.findUnique({ where: { id: documentId } })
  if (!document || document.dealId !== dealId) throw new ApiError('Document not found on this deal', 404)
  // Only an approved document is fit to share — an unreviewed file hasn't been
  // checked, and sharing a rejected one would pass on something known to be wrong.
  if (document.status !== 'APPROVED') {
    throw new ApiError('Only an approved document can be shared', 400)
  }
  if (!document.fileUrl) throw new ApiError('That document has no uploaded file to share', 400)
  // It has to belong to the party the request was aimed at, or this would leak
  // some third document into the exchange.
  if (document.ownerId && document.ownerId !== request.requestedFromId) {
    throw new ApiError('That document does not belong to the party this request was made to', 400)
  }

  await prisma.$transaction(async (tx) => {
    // Idempotent: re-sharing the same document to the same person on the same
    // deal reactivates the grant rather than erroring or duplicating it.
    await tx.documentAccessGrant.upsert({
      where: {
        documentId_grantedToId_dealId: {
          documentId,
          grantedToId: request.requestedById,
          dealId,
        },
      },
      create: {
        documentId,
        dealId,
        grantedToId: request.requestedById,
        grantedById: user.id,
        purpose: `Shared in response to request for "${request.docType}"`,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE', revokedAt: null, grantedById: user.id },
    })
    await tx.documentRequest.update({
      where: { id: requestId },
      data: {
        status: 'EXISTING_DOCUMENT_SHARED',
        sourceDocumentId: documentId,
        agentId: deal.agentId ?? user.id,
        reviewRemarks: body.remarks?.trim() || null,
      },
    })
    await recordAudit(
      {
        action: 'DOCUMENT_EXISTING_FILE_SHARED',
        actorId: user.id,
        entity: 'DealDocument',
        entityId: documentId,
        meta: { requestId, grantedToId: request.requestedById, docType: document.docType },
      },
      tx
    )
    await recordAudit(
      {
        action: 'DOCUMENT_ACCESS_GRANTED',
        actorId: user.id,
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
      message: `"${document.docType}" for ${deal.property.title} has been shared with you.`,
    },
    {
      userId: request.requestedFromId,
      title: 'Your document was shared',
      message: `Your approved "${document.docType}" was shared with the other party for ${deal.property.title}.`,
    },
  ])

  const full = await prisma.documentRequest.findUnique({ where: { id: requestId }, include: INCLUDE })
  return ok(documentRequestDTO(full!))
})
