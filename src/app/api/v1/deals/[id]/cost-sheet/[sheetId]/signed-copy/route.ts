import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { recordAudit } from '@/lib/audit'

/** Files the formal signed cost sheet against the structured one.
 *
 *  The line items stay the source of truth — they are what reconciles against the
 *  agreed price and what the buyer queries. This is the paper for the file,
 *  alongside rather than instead of, stored as a DealDocument so it inherits the
 *  existing ownership and access-grant machinery.
 *
 *  Filed as docType COST_SHEET, which the closure gate and the documentation stage
 *  both skip: it is staff output, not something a party was asked to supply, and
 *  counting it as an unapproved closure requirement would stall the deal it is
 *  meant to record.
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId, sheetId } = await ctx.params

  const body = await readJson<{ fileUrl?: string }>(req)
  const fileUrl = String(body.fileUrl ?? '').trim()
  if (!fileUrl) throw new ApiError('fileUrl is required — upload the file first via POST /uploads', 400)

  const sheet = await prisma.costSheet.findUnique({
    where: { id: sheetId },
    include: { deal: { select: { id: true, agentId: true, status: true } } },
  })
  if (!sheet || sheet.dealId !== dealId) throw new ApiError('Cost sheet not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isStaff && sheet.deal.agentId !== user.id) throw new ApiError('Forbidden', 403)
  // Only a sheet the buyer has actually been sent is worth filing a signed copy of.
  if (sheet.status === 'DRAFT') throw new ApiError('Send this sheet before filing a signed copy', 409)

  const document = await prisma.$transaction(async (tx) => {
    // Replacing an earlier copy leaves the old document in place rather than
    // deleting it: a superseded signed version is still part of the record.
    const created = await tx.dealDocument.create({
      data: {
        dealId,
        docType: 'COST_SHEET',
        // Nobody is being chased for this — it is already in hand.
        requiredFrom: 'EITHER',
        fileUrl,
        status: 'UPLOADED',
        uploadedBy: user.id,
        remarks: `Signed cost sheet v${sheet.version}`,
      },
    })

    await tx.costSheet.update({ where: { id: sheetId }, data: { signedDocumentId: created.id } })

    await recordAudit(
      {
        action: 'DOCUMENT_UPLOADED',
        actorId: user.id,
        entity: 'DealDocument',
        entityId: created.id,
        meta: { dealId, costSheetId: sheetId, version: sheet.version, docType: 'COST_SHEET' },
      },
      tx
    )

    return created
  })

  return ok({ costSheetId: sheetId, documentId: document.id, fileUrl: document.fileUrl }, 201)
})
