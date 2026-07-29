import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/** Structured audit trail for workflow transitions.
 *
 *  Distinct from DealLogEntry: that's human-readable progress notes written for
 *  the buyer and seller to read. This is the machine-written record of who did
 *  what and when, used to reconstruct a transaction after the fact. Never
 *  edited or deleted, and never shown raw to a customer.
 */
export type AuditAction =
  // Lead / interest
  | 'INTEREST_CREATED'
  | 'INTEREST_STATUS_CHANGED'
  | 'AGENT_ASSIGNED'
  // Site visit
  | 'SITE_VISIT_REQUESTED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_COMPLETED'
  | 'SITE_VISIT_CANCELLED'
  | 'SITE_VISIT_OUTCOME_RECORDED'
  // Negotiation
  | 'NEGOTIATION_STARTED'
  | 'NEGOTIATION_EVENT_RECORDED'
  | 'BUYER_CONFIRMED'
  | 'SELLER_CONFIRMED'
  | 'AGREEMENT_REACHED'
  | 'NEGOTIATION_FAILED'
  | 'NEGOTIATION_DISPUTED'
  | 'NEGOTIATION_DISPUTE_RESOLVED'
  // Deal
  | 'DEAL_CREATED'
  | 'DEAL_CLOSED'
  | 'DEAL_FELL_THROUGH'
  | 'DEAL_STAGE_DECLARED'
  // Documents
  | 'DOCUMENT_REQUESTED'
  | 'DOCUMENT_REQUEST_APPROVED'
  | 'DOCUMENT_REQUEST_REJECTED'
  | 'DOCUMENT_EXISTING_FILE_SHARED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_REVIEWED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_ACCESS_GRANTED'
  | 'DOCUMENT_ACCESS_REVOKED'
  // Identity / signing
  | 'IDENTITY_VERIFICATION_STARTED'
  | 'IDENTITY_VERIFIED'
  | 'IDENTITY_VERIFICATION_FAILED'
  | 'AGREEMENT_CREATED'
  | 'SIGNATURE_REQUESTED'
  | 'SIGNATURE_COMPLETED'
  // Payments
  | 'PAYMENT_REQUESTED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'

interface AuditInput {
  action: AuditAction
  actorId?: string | null
  entity?: string | null
  entityId?: string | null
  meta?: Prisma.InputJsonValue
}

/** Writes one audit row. Accepts an optional transaction client so a privileged
 *  action and its audit record commit or roll back together — an audit entry for
 *  a transition that got rolled back would be worse than none. */
export async function recordAudit(
  { action, actorId, entity, entityId, meta }: AuditInput,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma
  await client.auditLog.create({
    data: {
      action,
      actorId: actorId ?? null,
      entity: entity ?? null,
      entityId: entityId ?? null,
      ...(meta !== undefined ? { meta } : {}),
    },
  })
}
