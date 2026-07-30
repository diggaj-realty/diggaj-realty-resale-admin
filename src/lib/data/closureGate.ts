import { prisma } from '@/lib/prisma'
import { gatesDocumentation } from '@/lib/data/dealProgress'

/** Whether a deal is allowed to close.
 *
 *  Payment landing is not the same as a deal being done — the paperwork,
 *  identity checks and signatures all have to hold up too. Which of those are
 *  actually mandatory is configurable (AppConfig), because the legal bar varies
 *  by deal type and because identity/e-signing are newer than some in-flight
 *  deals: hard-coding them on would strand every transaction already mid-
 *  paperwork.
 *
 *  Returns every unmet requirement rather than the first, so staff see the whole
 *  remaining checklist instead of discovering it one rejection at a time.
 */
export interface ClosureCheck {
  canClose: boolean
  blockers: string[]
  requirements: {
    finalPayment: { required: boolean; met: boolean }
    documents: { required: boolean; met: boolean; approved: number; total: number }
    identity: { required: boolean; met: boolean; buyerVerified: boolean; sellerVerified: boolean }
    agreement: { required: boolean; met: boolean; fullyExecuted: boolean }
    payments: { required: boolean; met: boolean; settled: number; total: number }
  }
}

export async function evaluateClosureGate(dealId: string): Promise<ClosureCheck | null> {
  const [deal, config] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        documents: { select: { status: true, purpose: true } },
        identityVerifications: { select: { userId: true, status: true } },
        agreements: { select: { status: true, version: true }, orderBy: { version: 'desc' } },
        paymentRequests: { select: { status: true } },
      },
    }),
    prisma.appConfig.findFirst(),
  ])
  if (!deal) return null

  const requireDocuments = config?.closureRequiresDocuments ?? true
  const requireIdentity = config?.closureRequiresIdentity ?? false
  const requireAgreement = config?.closureRequiresAgreement ?? false
  const requirePayments = config?.closureRequiresPayments ?? false

  const blockers: string[] = []

  // Final payment recorded — the pre-existing rule, always enforced.
  const finalPaymentMet = deal.finalPaymentDate != null
  if (!finalPaymentMet) blockers.push('Record the final payment before closing the deal')

  // Documents the platform filed for the record — a signed cost sheet, a receipt —
  // are not outstanding requirements, so they must not hold closure open. Same rule
  // as the documentation stage, from the same helper, so the two cannot disagree.
  const gatingDocs = deal.documents.filter(gatesDocumentation)
  const docsTotal = gatingDocs.length
  const docsApproved = gatingDocs.filter((d) => d.status === 'APPROVED').length
  const documentsMet = docsApproved === docsTotal
  if (requireDocuments && !documentsMet) {
    blockers.push(
      `${docsTotal - docsApproved} required document${docsTotal - docsApproved === 1 ? '' : 's'} not yet approved`
    )
  }

  const buyerVerified = deal.identityVerifications.some(
    (v) => v.userId === deal.buyerId && v.status === 'VERIFIED'
  )
  const sellerVerified = deal.identityVerifications.some(
    (v) => v.userId === deal.sellerId && v.status === 'VERIFIED'
  )
  const identityMet = buyerVerified && sellerVerified
  if (requireIdentity && !identityMet) {
    const missing = [!buyerVerified && 'buyer', !sellerVerified && 'seller'].filter(Boolean).join(' and ')
    blockers.push(`Identity verification incomplete — ${missing} not verified`)
  }

  // Only the current version counts; superseded drafts are irrelevant.
  const latestAgreement = deal.agreements[0]
  const agreementMet = latestAgreement?.status === 'FULLY_EXECUTED'
  if (requireAgreement && !agreementMet) {
    blockers.push(
      latestAgreement
        ? 'The agreement is not yet fully executed by both parties'
        : 'No agreement has been generated for this deal'
    )
  }

  // Cancelled requests aren't owed, so they don't hold closure up.
  const livePayments = deal.paymentRequests.filter((p) => p.status !== 'CANCELLED')
  const settled = livePayments.filter((p) => p.status === 'PAID').length
  const paymentsMet = settled === livePayments.length
  if (requirePayments && !paymentsMet) {
    blockers.push(`${livePayments.length - settled} payment request(s) still outstanding`)
  }

  return {
    canClose: blockers.length === 0,
    blockers,
    requirements: {
      finalPayment: { required: true, met: finalPaymentMet },
      documents: { required: requireDocuments, met: documentsMet, approved: docsApproved, total: docsTotal },
      identity: { required: requireIdentity, met: identityMet, buyerVerified, sellerVerified },
      agreement: { required: requireAgreement, met: agreementMet, fullyExecuted: agreementMet },
      payments: { required: requirePayments, met: paymentsMet, settled, total: livePayments.length },
    },
  }
}
