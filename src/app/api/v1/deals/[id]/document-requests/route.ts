import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { documentRequestDTO } from '@/lib/data/documentRequests'
import { recordAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'

const INCLUDE = {
  requestedBy: { select: { name: true } },
  requestedFrom: { select: { name: true } },
  agent: { select: { name: true } },
  sourceDocument: { select: { id: true, docType: true, status: true } },
}

/** Cross-party document requests on a deal.
 *
 *  A buyer or seller sees the requests they made and the ones aimed at them; the
 *  agent and staff see all of them, since the agent is the one who has to
 *  adjudicate. Note a party does NOT see requests between the other party and
 *  the agent about documents that don't involve them.
 */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  const isAgent = deal.agentId === user.id
  const isParty = deal.buyerId === user.id || deal.sellerId === user.id
  if (!isStaff && !isAgent && !isParty) throw new ApiError('Forbidden', 403)

  const requests = await prisma.documentRequest.findMany({
    where: {
      dealId,
      ...(isStaff || isAgent
        ? {}
        : { OR: [{ requestedById: user.id }, { requestedFromId: user.id }] }),
    },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE,
  })

  return ok(requests.map(documentRequestDTO))
})

/** One party asks the other for a document.
 *
 *  Always lands on the agent as PENDING_AGENT_REVIEW — there is no request shape
 *  that reaches the counterparty directly. The requester doesn't choose who it
 *  goes to either: it's derived as "the other party on this deal", so a buyer
 *  can only ever request from the seller and vice versa.
 *
 *  Body: `{ docType, reason? }`
 */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER'])
  const { id: dealId } = await ctx.params
  const body = await readJson<{ docType?: string; reason?: string }>(req)

  const docType = String(body.docType || '').trim()
  if (!docType) throw new ApiError('docType is required', 400)

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isBuyer = deal.buyerId === user.id
  const isSeller = deal.sellerId === user.id
  if (!isBuyer && !isSeller) throw new ApiError('Forbidden', 403)
  if (deal.status === 'CLOSED') throw new ApiError('This deal is closed', 400)

  // The counterparty is whoever the requester isn't — not something the caller
  // gets to nominate.
  const requestedFromId = isBuyer ? deal.sellerId : deal.buyerId

  // One open request per document type per direction, so a party can't spam the
  // agent with the same ask.
  const existing = await prisma.documentRequest.findFirst({
    where: {
      dealId,
      requestedById: user.id,
      requestedFromId,
      docType,
      status: { in: ['PENDING_AGENT_REVIEW', 'FORWARDED_TO_OWNER'] },
    },
  })
  if (existing) throw new ApiError('You already have an open request for this document', 409)

  const request = await prisma.documentRequest.create({
    data: {
      dealId,
      requestedById: user.id,
      requestedFromId,
      agentId: deal.agentId,
      docType,
      reason: body.reason ? String(body.reason).trim() || null : null,
      status: 'PENDING_AGENT_REVIEW',
    },
  })

  await recordAudit({
    action: 'DOCUMENT_REQUESTED',
    actorId: user.id,
    entity: 'DocumentRequest',
    entityId: request.id,
    meta: { dealId, docType, requestedFromId, via: isBuyer ? 'BUYER' : 'SELLER' },
  })

  // Only the agent (or staff, if there's no agent yet) is told. The party the
  // document is wanted from hears nothing until the agent decides it's a
  // legitimate ask.
  if (deal.agentId) {
    await notifyUsers([
      {
        userId: deal.agentId,
        title: 'Document request to review',
        message: `${user.name} has requested "${docType}" from the other party on ${deal.property.title}.`,
      },
    ])
  } else {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['BACKEND', 'ADMIN'] }, isActive: true },
      select: { id: true },
    })
    await notifyUsers(
      staff.map((s) => ({
        userId: s.id,
        title: 'Document request needs review',
        message: `A document request on ${deal.property.title} has no assigned agent to review it.`,
      }))
    )
  }

  const full = await prisma.documentRequest.findUnique({ where: { id: request.id }, include: INCLUDE })
  return ok(documentRequestDTO(full!), 201)
})
