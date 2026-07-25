import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDocumentDTO } from '@/lib/api/dto'
import { notifyUsers } from '@/lib/notify'

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
 *  who's responsible for uploading it. Visible to every deal participant
 *  (buyer, seller, assigned agent) plus ADMIN/BACKEND. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER', 'BUYER', 'AGENT', 'ADMIN', 'BACKEND'])
  const { id: dealId } = await ctx.params
  await requireDealAccess(dealId, user)

  const documents = await prisma.dealDocument.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
  return ok(documents.map(dealDocumentDTO))
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

  const body = await readJson<{ docType?: string; requiredFrom?: string }>(req)
  const docType = String(body.docType || '').trim()
  const requiredFrom = String(body.requiredFrom || '').toUpperCase()
  if (!docType) throw new ApiError('docType is required', 400)
  if (!REQUIRED_FROM.includes(requiredFrom as (typeof REQUIRED_FROM)[number])) {
    throw new ApiError(`requiredFrom must be one of: ${REQUIRED_FROM.join(', ')}`, 400)
  }

  const document = await prisma.dealDocument.create({
    data: { dealId, docType, requiredFrom, status: 'PENDING' },
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
