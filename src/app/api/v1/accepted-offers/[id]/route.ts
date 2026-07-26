import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import {
  propertyDTO,
  offerDTO,
  dealDTO,
  dealDocumentDTO,
  offlineNegotiationDTO,
  paymentRequestDTO,
} from '@/lib/api/dto'
import { siteVisitDTO } from '@/app/api/v1/site-visits/route'
import { computeDealProgress } from '@/lib/data/dealProgress'

/** The complete transaction context for one accepted offer — property, both
 *  parties, the negotiation history that produced it, site visit, offline
 *  negotiation records, documents, payment requests, and the derived stage.
 *
 *  `:id` is the deal id (a deal is created at acceptance, so it's the stable
 *  handle for the whole post-acceptance process).
 *
 *  Readable by the deal's own buyer/seller/agent and by BACKEND/ADMIN. The two
 *  counterparties get the same transaction view the internal team does, minus
 *  nothing — they're principals in it. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      property: {
        include: {
          photos: { orderBy: { order: 'asc' } },
          seller: { select: { name: true, email: true } },
          agent: { select: { name: true } },
        },
      },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      seller: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true, email: true, phone: true } },
      documents: { orderBy: { createdAt: 'asc' } },
      logEntries: { orderBy: { createdAt: 'desc' } },
      siteVisit: true,
      offlineNegotiations: { orderBy: { createdAt: 'desc' }, include: { recordedBy: { select: { name: true } } } },
      paymentRequests: { orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { name: true } } } },
    },
  })
  if (!deal) throw new ApiError('Accepted offer not found', 404)

  const isBuyer = deal.buyerId === user.id
  const isSeller = deal.sellerId === user.id
  const isAgent = deal.agentId === user.id
  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN'
  if (!isBuyer && !isSeller && !isAgent && !isStaff) throw new ApiError('Forbidden', 403)

  // The offer that produced this deal, with its full negotiation timeline. Null
  // when the deal came straight from a site visit (agreed in person, no online
  // offer ever existed) — a legitimate path, not a data problem.
  const acceptedOffer = await prisma.offer.findFirst({
    where: { propertyId: deal.propertyId, buyerId: deal.buyerId, status: 'ACCEPTED' },
    include: {
      property: { select: { title: true, location: true } },
      buyer: { select: { name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })

  const progress = computeDealProgress(deal)

  // A counterparty sees only the payment requests addressed to them; staff and
  // the assigned agent need both sides to reconcile.
  const seesAllPayments = isStaff || isAgent
  const visiblePayments = seesAllPayments
    ? deal.paymentRequests
    : deal.paymentRequests.filter((r) => r.recipient === (isBuyer ? 'BUYER' : 'SELLER'))

  return ok({
    dealId: deal.id,
    stage: progress.stage,
    stageLabel: progress.label,
    documentProgress: progress.documents,
    paymentProgress: progress.payments,

    property: propertyDTO(deal.property),
    buyer: deal.buyer,
    seller: deal.seller,
    agent: deal.agent,

    acceptedOffer: acceptedOffer ? offerDTO(acceptedOffer, { forBuyer: isBuyer }) : null,
    deal: dealDTO(deal),

    siteVisit: deal.siteVisit ? siteVisitDTO(deal.siteVisit) : null,
    offlineNegotiations: deal.offlineNegotiations.map(offlineNegotiationDTO),
    documents: deal.documents.map(dealDocumentDTO),
    paymentRequests: visiblePayments.map(paymentRequestDTO),

    // Free-text staff progress notes. Buyer/seller see them too — they're
    // written as customer-facing status updates ("sale deed drafting started").
    logEntries: deal.logEntries.map((e) => ({
      id: e.id,
      message: e.message,
      authorRole: e.authorRole,
      createdAt: e.createdAt.toISOString(),
    })),
  })
})
