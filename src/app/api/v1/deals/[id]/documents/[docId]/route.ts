import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDocumentDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'

const REVIEW_STATUSES = ['APPROVED', 'REJECTED'] as const

/** Two distinct actions on one checklist item, gated by who's calling:
 *  - buyer/seller (whoever the doc is requiredFrom) uploads a fileUrl →
 *    status auto-advances to UPLOADED.
 *  - staff (ADMIN/BACKEND, or the deal's own AGENT) reviews an UPLOADED doc,
 *    setting APPROVED or REJECTED with optional remarks.
 *  Neither party can approve their own upload — review is staff-only, same
 *  trust boundary as every other verification step on this platform. */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN', 'BACKEND'])
  const { id: dealId, docId } = await ctx.params

  const document = await prisma.dealDocument.findUnique({ where: { id: docId } })
  if (!document || document.dealId !== dealId) throw new ApiError('Document not found', 404)

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const body = await readJson<{ fileUrl?: string; status?: string; remarks?: string }>(req)
  const isStaff =
    user.role === 'ADMIN' || user.role === 'BACKEND' || (user.role === 'AGENT' && deal.agentId === user.id)

  if (body.status !== undefined) {
    if (!isStaff) throw new ApiError('Only staff can review a document', 403)
    const status = String(body.status).toUpperCase()
    if (!REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
      throw new ApiError(`status must be one of: ${REVIEW_STATUSES.join(', ')}`, 400)
    }
    if (document.status !== 'UPLOADED') throw new ApiError('Document must be uploaded before it can be reviewed', 400)

    const remarks = body.remarks ? String(body.remarks).trim() : ''
    // A rejection with no reason leaves the uploader guessing at what to fix, so
    // they just re-upload the same file. Approvals need no justification.
    if (status === 'REJECTED' && !remarks) {
      throw new ApiError('remarks is required when rejecting a document — say what needs fixing', 400)
    }

    const updated = await prisma.dealDocument.update({
      where: { id: docId },
      data: { status, remarks: remarks || null },
    })
    await recordAudit({
      action: status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      actorId: user.id,
      entity: 'DealDocument',
      entityId: docId,
      meta: { docType: document.docType, remarks: remarks || null },
    })
    await notifyUsers([
      {
        userId: document.uploadedBy ?? (document.requiredFrom === 'SELLER' ? deal.sellerId : deal.buyerId),
        title: status === 'APPROVED' ? 'Document approved' : 'Document rejected',
        message:
          status === 'APPROVED'
            ? `"${document.docType}" was approved.`
            : `"${document.docType}" was rejected — please re-upload. Reason: ${remarks}`,
      },
    ])
    return ok(dealDocumentDTO(updated))
  }

  if (body.fileUrl !== undefined) {
    const isResponsibleParty =
      (document.requiredFrom === 'BUYER' && user.id === deal.buyerId) ||
      (document.requiredFrom === 'SELLER' && user.id === deal.sellerId) ||
      (document.requiredFrom === 'EITHER' && (user.id === deal.buyerId || user.id === deal.sellerId))
    if (!isResponsibleParty && !isStaff) throw new ApiError('Forbidden', 403)

    const fileUrl = String(body.fileUrl).trim()
    if (!fileUrl) throw new ApiError('fileUrl is required', 400)

    const updated = await prisma.dealDocument.update({
      where: { id: docId },
      data: {
        fileUrl,
        status: 'UPLOADED',
        uploadedBy: user.id,
        // An EITHER document has no owner until someone actually supplies it —
        // whoever uploads becomes the owner, which is what governs who may read it.
        ...(document.ownerId == null && user.id !== deal.agentId ? { ownerId: user.id } : {}),
        remarks: null,
      },
    })

    await recordAudit({
      action: 'DOCUMENT_UPLOADED',
      actorId: user.id,
      entity: 'DealDocument',
      entityId: docId,
      meta: { docType: document.docType },
    })

    if (deal.agentId) {
      await notifyUsers([
        { userId: deal.agentId, title: 'Document uploaded', message: `"${document.docType}" was uploaded and is ready for review.` },
      ])
    }
    return ok(dealDocumentDTO(updated))
  }

  throw new ApiError('Provide fileUrl (to upload) or status (to review)', 400)
})
