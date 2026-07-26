import type { DealAgreement, DealSignature } from '@prisma/client'

/** Agreement + signature shaping and the derived execution state.
 *
 *  The agreement's status is driven by the signature records rather than set by
 *  hand, so "fully executed" can only be true when both parties' signatures
 *  actually say SIGNED. That keeps an agent from declaring a contract executed.
 */

export const AGREEMENT_STATUSES = [
  'DRAFT',
  'READY_FOR_SIGNATURE',
  'SIGNING_IN_PROGRESS',
  'PARTIALLY_SIGNED',
  'FULLY_EXECUTED',
  'EXPIRED',
  'CANCELLED',
] as const
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number]

export const SIGNATURE_STATUSES = ['PENDING', 'INITIATED', 'SIGNED', 'FAILED', 'EXPIRED'] as const
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number]

type SignatureWithUser = DealSignature & { user?: { name: string } | null }
type AgreementWithSignatures = DealAgreement & { signatures?: SignatureWithUser[] }

export function signatureDTO(s: SignatureWithUser) {
  return {
    id: s.id,
    agreementId: s.agreementId,
    userId: s.userId,
    userName: s.user?.name,
    role: s.role,
    status: s.status,
    provider: s.provider,
    providerReference: s.providerReference,
    signedAt: s.signedAt ? s.signedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }
}

export function agreementDTO(a: AgreementWithSignatures) {
  const signatures = a.signatures ?? []
  const buyerSig = signatures.find((s) => s.role === 'BUYER')
  const sellerSig = signatures.find((s) => s.role === 'SELLER')

  return {
    id: a.id,
    dealId: a.dealId,
    version: a.version,
    status: a.status,
    documentUrl: a.documentUrl,
    checksum: a.checksum,
    agreedAmount: a.agreedAmount,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    buyerSigned: buyerSig?.status === 'SIGNED',
    sellerSigned: sellerSig?.status === 'SIGNED',
    fullyExecuted: a.status === 'FULLY_EXECUTED',
    ...(a.signatures ? { signatures: signatures.map(signatureDTO) } : {}),
  }
}

/** What the agreement's status should be, given its signatures.
 *
 *  Terminal states (cancelled, expired, already executed) are left alone —
 *  recomputing those from signature rows would be a way to resurrect a retired
 *  document.
 */
export function deriveAgreementStatus(
  current: string,
  signatures: Pick<DealSignature, 'status'>[]
): AgreementStatus {
  if (current === 'CANCELLED' || current === 'EXPIRED' || current === 'FULLY_EXECUTED') {
    return current as AgreementStatus
  }

  const signed = signatures.filter((s) => s.status === 'SIGNED').length
  if (signatures.length > 0 && signed === signatures.length) return 'FULLY_EXECUTED'
  if (signed > 0) return 'PARTIALLY_SIGNED'
  if (signatures.some((s) => s.status === 'INITIATED')) return 'SIGNING_IN_PROGRESS'
  return current === 'DRAFT' ? 'DRAFT' : 'READY_FOR_SIGNATURE'
}
