/** Derived operational stages for a post-acceptance deal.
 *
 *  Deal.status stays the authoritative field (IN_PROGRESS | CLOSED) — these
 *  stages are computed from the underlying records purely so the internal
 *  dashboard can show where a transaction actually is. Nothing writes them.
 */
export type DealStage =
  | 'OFFER_ACCEPTED'
  | 'AGENT_ASSIGNED'
  | 'SITE_VISIT_PENDING'
  | 'SITE_VISIT_COMPLETED'
  | 'NEGOTIATION_RECORDED'
  | 'DOCUMENTATION_IN_PROGRESS'
  | 'DOCUMENTATION_COMPLETE'
  | 'IDENTITY_VERIFICATION'
  | 'AGREEMENT_SIGNING'
  | 'PAYMENT_IN_PROGRESS'
  | 'PAYMENT_COMPLETE'
  | 'DEAL_CLOSED'

export interface DealProgressInput {
  status: string
  agentId: string | null
  buyerId?: string
  sellerId?: string
  siteVisit?: { status: string; outcome: string | null } | null
  documents: { status: string }[]
  offlineNegotiations: unknown[]
  paymentRequests: { status: string; amount: number }[]
  /** Optional so existing callers that don't select these keep working — the
   *  identity and signing stages simply don't apply if they aren't loaded. */
  identityVerifications?: { userId: string; status: string }[]
  agreements?: { status: string; version: number }[]
}

export interface DealProgress {
  stage: DealStage
  label: string
  documents: { approved: number; total: number }
  payments: { paid: number; total: number; pendingAmount: number }
}

const STAGE_LABELS: Record<DealStage, string> = {
  OFFER_ACCEPTED: 'Offer accepted',
  AGENT_ASSIGNED: 'Agent assigned',
  SITE_VISIT_PENDING: 'Site visit pending',
  SITE_VISIT_COMPLETED: 'Site visit completed',
  NEGOTIATION_RECORDED: 'Negotiation recorded',
  DOCUMENTATION_IN_PROGRESS: 'Documentation in progress',
  DOCUMENTATION_COMPLETE: 'Documentation complete',
  IDENTITY_VERIFICATION: 'Identity verification',
  AGREEMENT_SIGNING: 'Agreement signing',
  PAYMENT_IN_PROGRESS: 'Payment in progress',
  PAYMENT_COMPLETE: 'Payment complete',
  DEAL_CLOSED: 'Deal closed',
}

/** Walks the stages furthest-first and returns the deepest one reached. */
export function computeDealProgress(deal: DealProgressInput): DealProgress {
  const docsTotal = deal.documents.length
  const docsApproved = deal.documents.filter((d) => d.status === 'APPROVED').length

  const livePayments = deal.paymentRequests.filter((p) => p.status !== 'CANCELLED')
  const paymentsPaid = livePayments.filter((p) => p.status === 'PAID').length
  const pendingAmount = livePayments
    .filter((p) => p.status !== 'PAID')
    .reduce((sum, p) => sum + p.amount, 0)

  const docsOutstanding = docsTotal > 0 && docsApproved < docsTotal

  const stage: DealStage = (() => {
    if (deal.status === 'CLOSED') return 'DEAL_CLOSED'

    // Documentation gates closure, so it also gates the reported stage: a deal
    // with an unapproved document is still "documentation in progress" even if
    // someone has already raised (or settled) a payment request. Reporting a
    // payment stage there would overstate how far along the transaction is.
    if (docsOutstanding) return 'DOCUMENTATION_IN_PROGRESS'

    if (livePayments.length > 0) {
      return paymentsPaid === livePayments.length ? 'PAYMENT_COMPLETE' : 'PAYMENT_IN_PROGRESS'
    }

    // Between documentation and payment sit identity verification and signing.
    // These only report when the records exist — a deal predating them shouldn't
    // appear stalled at a stage it was never subject to.
    const agreements = deal.agreements ?? []
    const latestAgreement = agreements[0]
    if (latestAgreement && latestAgreement.status !== 'FULLY_EXECUTED') return 'AGREEMENT_SIGNING'

    const verifications = deal.identityVerifications ?? []
    if (verifications.length > 0 && !latestAgreement) {
      const buyerOk = verifications.some((v) => v.userId === deal.buyerId && v.status === 'VERIFIED')
      const sellerOk = verifications.some((v) => v.userId === deal.sellerId && v.status === 'VERIFIED')
      if (!buyerOk || !sellerOk) return 'IDENTITY_VERIFICATION'
    }

    if (docsTotal > 0) return 'DOCUMENTATION_COMPLETE'
    if (deal.offlineNegotiations.length > 0) return 'NEGOTIATION_RECORDED'
    if (deal.siteVisit?.status === 'COMPLETED') return 'SITE_VISIT_COMPLETED'
    if (deal.siteVisit) return 'SITE_VISIT_PENDING'
    if (deal.agentId) return 'AGENT_ASSIGNED'
    return 'OFFER_ACCEPTED'
  })()

  return {
    stage,
    label: STAGE_LABELS[stage],
    documents: { approved: docsApproved, total: docsTotal },
    payments: { paid: paymentsPaid, total: livePayments.length, pendingAmount },
  }
}

export { STAGE_LABELS }
