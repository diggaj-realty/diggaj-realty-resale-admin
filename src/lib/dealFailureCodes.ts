/** Why a deal collapsed. Pure/no imports — must stay importable from client
 *  components (the fell-through form's reason dropdown) without dragging in
 *  Prisma/pg, which breaks the browser bundle (pg needs Node's `dns` module).
 *  Same constraint as statusTone.ts. */

export const DEAL_FAILURE_CODES = [
  'BUYER_WITHDREW',
  'SELLER_WITHDREW',
  'FINANCING_DENIED',
  'LEGAL_TITLE_ISSUE',
  'PRICE_DISPUTE',
  'UNRESPONSIVE',
  'OTHER',
] as const

export type DealFailureCode = (typeof DEAL_FAILURE_CODES)[number]

export const DEAL_FAILURE_LABELS: Record<DealFailureCode, string> = {
  BUYER_WITHDREW: 'Buyer withdrew',
  SELLER_WITHDREW: 'Seller withdrew',
  FINANCING_DENIED: 'Loan / financing denied',
  LEGAL_TITLE_ISSUE: 'Legal or title issue',
  PRICE_DISPUTE: 'Could not agree on price',
  UNRESPONSIVE: 'Party went unresponsive',
  OTHER: 'Other',
}

export function isDealFailureCode(value: string): value is DealFailureCode {
  return (DEAL_FAILURE_CODES as readonly string[]).includes(value)
}
