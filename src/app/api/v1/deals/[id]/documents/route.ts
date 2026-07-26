import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDocumentDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'
import { inferOwnerId } from '@/lib/data/documentRequests'

const REQUIRED_FROM = ['BUYER', 'SELLER', 'EITHER'] as const

async function requireDealAccess(dealId: string, user: { id: string; role: string }) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  const isParticipant = deal.sellerId === user.id || deal.buyerId === user.id || deal.agentId === user.id
  const isStaff = user.role === 'ADMIN' || user.role === 'BACKEND'
  if (!isStaff && !isParticipant) throw new ApiError('Forbidden', 403)
  return deal
}

/** Deal closure document checklist — the legal paperwork (sale deed, NOC,
 *  encumbrance certificate, etc.) tracked per deal, each with a status and
 *  who's responsible for uploading it.
 *
 *  Visibility is per-document, not per-deal. These are sensitive personal
 *  records, so being party to the deal is not by itself grounds to read the
 *  other side's ID documents:
 *
 *    - the owner sees their own;
 *    - the assigned agent and ADMIN/BACKEND get review access to all;
 *    - the counterparty sees a document only via an explicit access grant.
 *
 *  Each item carries `canView`, and `fileUrl` is withheld when that's false, so
 *  a party can still see *that* a requirement exists and its progress without
 *  being handed the file itself. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN', 'BACKEND'])
  const { id: dealId } = await ctx.params
  const deal = await requireDealAccess(dealId, user)

  const documents = await prisma.dealDocument.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })

  // One query for every grant this caller holds on this deal, rather than a
  // per-document round trip.
  const grants = await prisma.documentAccessGrant.findMany({
    where: { dealId, grantedToId: user.id, status: 'ACTIVE' },
    select: { documentId: true },
  })
  const grantedIds = new Set(grants.map((g) => g.documentId))

  const isStaff = user.role === 'ADMIN' || user.role === 'BACKEND'
  const isAgent = deal.agentId === user.id

  const payload = documents.map((d) => {
    const ownerId = d.ownerId ?? inferOwnerId(d.requiredFrom, deal)
    const canView =
      isStaff ||
      isAgent ||
      ownerId === user.id ||
      grantedIds.has(d.id) ||
      // Documents predating ownership tracking fall back to participant
      // visibility so existing deals don't suddenly go dark.
      ownerId === null

    const dto = dealDocumentDTO(d)
    return { ...dto, ownerId, canView, ...(canView ? {} : { fileUrl: null }) }
  })

  return ok(payload)
})

/** Adds a checklist item. Staff-only (ADMIN/BACKEND, or the deal's own
 *  AGENT) — buyers/sellers fulfill checklist items via PATCH, they don't
 *  define what's required. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'ADMIN', 'BACKEND'])
  const { id: dealId } = await ctx.params
  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (user.role === 'AGENT' && deal.agentId !== user.id) throw new ApiError('Forbidden', 403)

  const body = await readJson<{ docType?: string; requiredFrom?: string; remarks?: string }>(req)
  const docType = String(body.docType || '').trim()
  const requiredFrom = String(body.requiredFrom || '').toUpperCase()
  const remarks = body.remarks ? String(body.remarks).trim() : ''
  if (!docType) throw new ApiError('docType is required', 400)
  if (!REQUIRED_FROM.includes(requiredFrom as (typeof REQUIRED_FROM)[number])) {
    throw new ApiError(`requiredFrom must be one of: ${REQUIRED_FROM.join(', ')}`, 400)
  }

  const document = await prisma.dealDocument.create({
    data: {
      dealId,
      docType,
      requiredFrom,
      // Recorded up front so visibility works before anything is uploaded.
      // EITHER genuinely has no single owner until someone actually uploads.
      ownerId: inferOwnerId(requiredFrom, deal),
      status: 'PENDING',
      remarks: remarks || null,
    },
  })

  const recipients =
    requiredFrom === 'BUYER' ? [deal.buyerId] : requiredFrom === 'SELLER' ? [deal.sellerId] : [deal.buyerId, deal.sellerId]
  await notifyUsers(
    recipients.map((userId) => ({
      userId,
      title: 'Document required',
      message: `"${docType}" is needed to close your deal — upload it when ready.`,
    }))
  )

  return ok(dealDocumentDTO(document), 201)
})
