/** Operational stages for a post-acceptance deal.
 *
 *  Deal.status stays the authoritative field (IN_PROGRESS | CLOSED |
 *  FELL_THROUGH). Stages sit alongside it to show where a transaction actually
 *  is, and come from two sources:
 *
 *  - **Derived** (`computeDealProgress`) — read off the underlying records:
 *    approved documents, identity verifications, signatures, payments. Cannot
 *    lie, but can only see what the platform is party to.
 *  - **Declared** (`Deal.manualStage`) — set by an agent or backend to record
 *    coordination work that happens on phones and at properties, which no
 *    record captures.
 *
 *  The effective stage is the further of the two (`resolveDealStage`), with one
 *  hard rule: a declaration can only reach a SOFT stage. Anything resting on
 *  evidence — documents complete, identity, signing, payment, closure — stays
 *  derived, because those are the claims that would matter in a dispute and
 *  nobody should be able to assert them by pressing a button. A revert likewise
 *  cannot drop the stage below what the records already prove.
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
  /** Terminal, but not an achievement — the sale did not happen. Reported
   *  regardless of how far the paperwork had got, since none of it stands. */
  | 'DEAL_FELL_THROUGH'

export interface DealProgressInput {
  status: string
  agentId: string | null
  buyerId?: string
  sellerId?: string
  siteVisit?: { status: string; outcome: string | null } | null
  /** `docType` is optional so existing callers keep working; when present,
   *  COST_SHEET copies are excluded — see DOCUMENTATION_EXCLUDED_TYPES. */
  documents: { status: string; docType?: string }[]
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
  DEAL_FELL_THROUGH: 'Deal fell through',
}

/** Walks the stages furthest-first and returns the deepest one reached. */
/** Document types that are staff output rather than something a party was asked to
 *  supply, so they do not gate documentation progress or closure. A signed cost
 *  sheet filed for the record would otherwise read as an unapproved closure
 *  requirement and stall the deal. */
export const DOCUMENTATION_EXCLUDED_TYPES = ['COST_SHEET']

function countsTowardDocumentation(doc: { docType?: string }): boolean {
  return !doc.docType || !DOCUMENTATION_EXCLUDED_TYPES.includes(doc.docType)
}

export function computeDealProgress(deal: DealProgressInput): DealProgress {
  const gatingDocs = deal.documents.filter(countsTowardDocumentation)
  const docsTotal = gatingDocs.length
  const docsApproved = gatingDocs.filter((d) => d.status === 'APPROVED').length

  const livePayments = deal.paymentRequests.filter((p) => p.status !== 'CANCELLED')
  const paymentsPaid = livePayments.filter((p) => p.status === 'PAID').length
  const pendingAmount = livePayments
    .filter((p) => p.status !== 'PAID')
    .reduce((sum, p) => sum + p.amount, 0)

  const docsOutstanding = docsTotal > 0 && docsApproved < docsTotal

  const stage: DealStage = (() => {
    if (deal.status === 'CLOSED') return 'DEAL_CLOSED'
    // A collapse overrides everything below it: documents approved and payments
    // taken on a dead deal must not read as progress toward a sale.
    if (deal.status === 'FELL_THROUGH') return 'DEAL_FELL_THROUGH'

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

/** Display/progression order. Index is the only notion of "further along" —
 *  DEAL_FELL_THROUGH is deliberately absent: it is terminal and orthogonal, not
 *  a rung on the ladder, and is handled before any of this is consulted. */
export const STAGE_ORDER: DealStage[] = [
  'OFFER_ACCEPTED',
  'AGENT_ASSIGNED',
  'SITE_VISIT_PENDING',
  'SITE_VISIT_COMPLETED',
  'NEGOTIATION_RECORDED',
  'DOCUMENTATION_IN_PROGRESS',
  'DOCUMENTATION_COMPLETE',
  'IDENTITY_VERIFICATION',
  'AGREEMENT_SIGNING',
  'PAYMENT_IN_PROGRESS',
  'PAYMENT_COMPLETE',
  'DEAL_CLOSED',
]

/** Stages staff may declare by hand.
 *
 *  All of these describe work the platform cannot observe — a call was made, a
 *  visit happened, a price was agreed in someone's living room, documents were
 *  asked for. Staff asserting them is strictly better information than the
 *  system guessing from an absence of records.
 *
 *  Everything past DOCUMENTATION_IN_PROGRESS is excluded on purpose. Those rest
 *  on artefacts the platform holds and can verify, and each one is a statement
 *  someone might later rely on — "identity was verified", "the agreement was
 *  signed", "the money arrived". A button is not evidence of any of them. */
export const SOFT_STAGES: DealStage[] = [
  'AGENT_ASSIGNED',
  'SITE_VISIT_PENDING',
  'SITE_VISIT_COMPLETED',
  'NEGOTIATION_RECORDED',
  'DOCUMENTATION_IN_PROGRESS',
]

export function stageIndex(stage: DealStage): number {
  return STAGE_ORDER.indexOf(stage)
}

export function isSoftStage(stage: string): stage is DealStage {
  return (SOFT_STAGES as string[]).includes(stage)
}

export function isDealStage(stage: string): stage is DealStage {
  return (STAGE_ORDER as string[]).includes(stage) || stage === 'DEAL_FELL_THROUGH'
}

/** The stage to show, given what the records prove and what staff declared.
 *
 *  Returns which source won so the UI can label it honestly — a buyer reading
 *  "documentation in progress" should be able to tell that a person said so,
 *  not that the system observed it.
 */
export function resolveDealStage(
  derived: DealStage,
  manualStage: string | null | undefined
): { stage: DealStage; label: string; source: 'DERIVED' | 'DECLARED' } {
  const derivedResult = { stage: derived, label: STAGE_LABELS[derived], source: 'DERIVED' as const }

  // A collapse (or closure) is terminal — a stale declaration must not drag a
  // finished deal back onto the ladder.
  if (derived === 'DEAL_FELL_THROUGH' || derived === 'DEAL_CLOSED') return derivedResult
  if (!manualStage || !isSoftStage(manualStage)) return derivedResult

  // Floored at the evidence: a declaration only ever moves the stage forward.
  return stageIndex(manualStage) > stageIndex(derived)
    ? { stage: manualStage, label: STAGE_LABELS[manualStage], source: 'DECLARED' }
    : derivedResult
}

export type StageChangeRejection =
  | 'NOT_A_STAGE'
  | 'NOT_DECLARABLE'
  | 'BELOW_EVIDENCE'
  | 'NO_CHANGE'
  | 'DEAL_FINISHED'

/** Whether staff may move this deal to `target`, given the derived stage.
 *
 *  Reverting is expressed as declaring an earlier stage. Clearing the
 *  declaration entirely (target === derived) is how staff undo a premature
 *  advance, so it is allowed even though it isn't "a move" in the ladder sense.
 */
export function canDeclareStage({
  target,
  derived,
  current,
  dealStatus,
}: {
  target: string
  derived: DealStage
  current: string | null | undefined
  dealStatus: string
}): { ok: true } | { ok: false; reason: StageChangeRejection } {
  if (dealStatus !== 'IN_PROGRESS') return { ok: false, reason: 'DEAL_FINISHED' }
  if (!isDealStage(target)) return { ok: false, reason: 'NOT_A_STAGE' }
  if (target === resolveDealStage(derived, current).stage) return { ok: false, reason: 'NO_CHANGE' }
  if (stageIndex(target) < stageIndex(derived)) return { ok: false, reason: 'BELOW_EVIDENCE' }
  // Equal to derived is the "clear my declaration" case, so only *ahead* of the
  // evidence needs to be a soft stage.
  if (stageIndex(target) > stageIndex(derived) && !isSoftStage(target)) {
    return { ok: false, reason: 'NOT_DECLARABLE' }
  }
  return { ok: true }
}

export const STAGE_REJECTION_MESSAGES: Record<StageChangeRejection, string> = {
  NOT_A_STAGE: 'That is not a valid stage',
  NOT_DECLARABLE:
    'This stage is confirmed by the platform, not set by hand — it moves on its own once the documents, verification, signatures or payment are recorded.',
  BELOW_EVIDENCE:
    'The deal has already progressed past this stage on record, so it cannot be moved back to it.',
  NO_CHANGE: 'The deal is already at this stage',
  DEAL_FINISHED: 'This deal is finished — its stage can no longer be changed',
}

/** Stages staff can move to right now, for rendering the control. */
export function declarableStages(derived: DealStage, current: string | null | undefined): DealStage[] {
  const effective = resolveDealStage(derived, current).stage
  return STAGE_ORDER.filter((s) => {
    if (s === effective) return false
    if (stageIndex(s) < stageIndex(derived)) return false
    return stageIndex(s) === stageIndex(derived) || isSoftStage(s)
  })
}
