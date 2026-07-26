import { prisma } from '@/lib/prisma'
import type { DocumentRequest, DocumentAccessGrant, DealDocument } from '@prisma/client'

/** Cross-party document requests and the access grants that satisfy them.
 *
 *  Two rules drive everything here:
 *
 *  1. A request never goes straight to the other party. It lands on the agent,
 *     who decides whether it's legitimate before the counterparty ever hears
 *     about it.
 *  2. The counterparty gets no access to a document by default. Sharing an
 *     already-approved document grants access to the *existing file* rather than
 *     copying it — the original party stays the owner, and there's one copy to
 *     audit rather than two drifting duplicates.
 */

export const DOCUMENT_REQUEST_STATUSES = [
  'PENDING_AGENT_REVIEW',
  'REJECTED',
  'FORWARDED_TO_OWNER',
  'EXISTING_DOCUMENT_SHARED',
  'OWNER_UPLOADED',
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
] as const
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number]

type RequestWithRelations = DocumentRequest & {
  requestedBy?: { name: string } | null
  requestedFrom?: { name: string } | null
  agent?: { name: string } | null
  sourceDocument?: { id: string; docType: string; status: string } | null
}

export function documentRequestDTO(r: RequestWithRelations) {
  return {
    id: r.id,
    dealId: r.dealId,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy?.name,
    requestedFromId: r.requestedFromId,
    requestedFromName: r.requestedFrom?.name,
    agentId: r.agentId,
    agentName: r.agent?.name,
    docType: r.docType,
    reason: r.reason,
    status: r.status,
    reviewRemarks: r.reviewRemarks,
    sourceDocumentId: r.sourceDocumentId,
    sourceDocument: r.sourceDocument
      ? { id: r.sourceDocument.id, docType: r.sourceDocument.docType, status: r.sourceDocument.status }
      : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

type GrantWithRelations = DocumentAccessGrant & {
  document?: { docType: string; status: string } | null
  grantedTo?: { name: string } | null
  grantedBy?: { name: string } | null
}

export function documentAccessGrantDTO(g: GrantWithRelations) {
  return {
    id: g.id,
    documentId: g.documentId,
    dealId: g.dealId,
    grantedToId: g.grantedToId,
    grantedToName: g.grantedTo?.name,
    grantedById: g.grantedById,
    grantedByName: g.grantedBy?.name,
    purpose: g.purpose,
    status: g.status,
    docType: g.document?.docType,
    documentStatus: g.document?.status,
    createdAt: g.createdAt.toISOString(),
    revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
  }
}

/** Whether `userId` may actually see this document's file.
 *
 *  The owner always can. The deal's assigned agent and backend/admin get review
 *  access — they have to be able to check what was uploaded. Anyone else, which
 *  in practice means the counterparty, needs a live DocumentAccessGrant.
 *
 *  Documents with no recorded owner predate ownership tracking; those fall back
 *  to deal-participant visibility so existing deals don't suddenly go dark.
 */
export async function canAccessDocument({
  document,
  deal,
  userId,
  userRole,
}: {
  document: Pick<DealDocument, 'id' | 'ownerId' | 'requiredFrom'>
  deal: { buyerId: string; sellerId: string; agentId: string | null }
  userId: string
  userRole: string
}): Promise<boolean> {
  if (userRole === 'BACKEND' || userRole === 'ADMIN') return true
  if (deal.agentId === userId) return true

  const ownerId = document.ownerId ?? inferOwnerId(document.requiredFrom, deal)
  if (ownerId === userId) return true
  // Pre-ownership documents: fall back to participant visibility rather than
  // locking the parties out of their own historic deal.
  if (ownerId === null) return deal.buyerId === userId || deal.sellerId === userId

  const grant = await prisma.documentAccessGrant.findFirst({
    where: { documentId: document.id, grantedToId: userId, status: 'ACTIVE' },
  })
  return grant != null
}

/** `requiredFrom` names a side rather than a person, so BUYER/SELLER map onto the
 *  deal's parties. EITHER genuinely has no single owner until someone uploads. */
export function inferOwnerId(
  requiredFrom: string,
  deal: { buyerId: string; sellerId: string }
): string | null {
  if (requiredFrom === 'BUYER') return deal.buyerId
  if (requiredFrom === 'SELLER') return deal.sellerId
  return null
}

/** Approved documents this party owns on this deal — what the agent can offer up
 *  instead of asking for a fresh upload. */
export async function findShareableDocuments({
  dealId,
  ownerId,
  docType,
}: {
  dealId: string
  ownerId: string
  docType?: string
}) {
  return prisma.dealDocument.findMany({
    where: {
      dealId,
      ownerId,
      status: 'APPROVED',
      fileUrl: { not: null },
      ...(docType ? { docType: { contains: docType, mode: 'insensitive' } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  })
}
