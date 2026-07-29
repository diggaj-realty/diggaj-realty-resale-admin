/** Cost-sheet vocabulary and arithmetic. Pure/no imports — must stay importable
 *  from client components (the sheet editor and the buyer's own view) without
 *  dragging in Prisma/pg, which breaks the browser bundle. Same constraint as
 *  statusTone.ts and phone.ts. */

export const COST_LINE_CATEGORIES = [
  'PROPERTY_PRICE',
  'CHARGE',
  'TAX',
  'STATUTORY',
  'DEDUCTION',
] as const

export type CostLineCategory = (typeof COST_LINE_CATEGORIES)[number]

export const COST_LINE_CATEGORY_LABELS: Record<CostLineCategory, string> = {
  PROPERTY_PRICE: 'Property price',
  CHARGE: 'Charge',
  TAX: 'Tax (GST etc.)',
  STATUTORY: 'Statutory (stamp duty, registration)',
  DEDUCTION: 'Deduction',
}

/** Categories whose amounts the platform cannot stand behind as firm figures.
 *
 *  Stamp duty and registration vary by sub-registrar office and move with circle
 *  rates. A buyer who budgets off a number shown as final and then finds it
 *  ₹40,000 higher on the day has been misled by the presentation, not the
 *  arithmetic — so these are labelled estimates wherever they are shown. */
export const ESTIMATE_CATEGORIES: CostLineCategory[] = ['STATUTORY']

export function isEstimateCategory(category: string): boolean {
  return (ESTIMATE_CATEGORIES as string[]).includes(category)
}

export function isCostLineCategory(value: string): value is CostLineCategory {
  return (COST_LINE_CATEGORIES as readonly string[]).includes(value)
}

/** DEDUCTION subtracts; everything else adds. Kept as a helper rather than
 *  inlined so the editor's running total and the stored total cannot disagree. */
export function signedAmount(line: { category: string; amount: number }): number {
  return line.category === 'DEDUCTION' ? -line.amount : line.amount
}

export interface CostLineLike {
  category: string
  amount: number
  sharedWithBuyer: boolean
}

export function costSheetTotal(lines: CostLineLike[]): number {
  return lines.reduce((sum, l) => sum + signedAmount(l), 0)
}

/** What the buyer actually sees. Internal lines are excluded from their total as
 *  well as their list — showing a total that doesn't add up from the visible
 *  rows would invite exactly the questions the sheet exists to answer. */
export function buyerVisibleTotal(lines: CostLineLike[]): number {
  return costSheetTotal(lines.filter((l) => l.sharedWithBuyer))
}

export type ReconcileProblem =
  | { kind: 'NO_PROPERTY_PRICE' }
  | { kind: 'MULTIPLE_PROPERTY_PRICE'; count: number }
  | { kind: 'PRICE_MISMATCH'; sheetAmount: number; agreedAmount: number }
  | { kind: 'PRICE_UNCONFIRMED' }
  | { kind: 'PROPERTY_PRICE_HIDDEN' }
  | { kind: 'EMPTY' }

/** Whether a sheet's property-price line matches what was actually agreed.
 *
 *  This is the check that stops a cost sheet quietly disagreeing with its own
 *  deal. Without it the sheet is just numbers in a box: staff could send a
 *  breakdown built on ₹1.70 Cr while the confirmed price is ₹1.68 Cr, and nobody
 *  would find out until the buyer added it up.
 *
 *  `agreedAmount` is the *confirmed* negotiated figure, or null when no figure
 *  has been agreed by both sides yet — in which case there is nothing to
 *  reconcile against and sending would be premature.
 */
export function reconcileCostSheet({
  lines,
  agreedAmount,
}: {
  lines: { category: string; amount: number; sharedWithBuyer: boolean }[]
  agreedAmount: number | null
}): ReconcileProblem[] {
  const problems: ReconcileProblem[] = []
  if (lines.length === 0) {
    problems.push({ kind: 'EMPTY' })
    return problems
  }

  const priceLines = lines.filter((l) => l.category === 'PROPERTY_PRICE')

  if (priceLines.length === 0) problems.push({ kind: 'NO_PROPERTY_PRICE' })
  if (priceLines.length > 1) problems.push({ kind: 'MULTIPLE_PROPERTY_PRICE', count: priceLines.length })

  // The one line the buyer must be able to see. A breakdown that hides what the
  // property itself costs is not a disclosure.
  if (priceLines.length > 0 && !priceLines.some((l) => l.sharedWithBuyer)) {
    problems.push({ kind: 'PROPERTY_PRICE_HIDDEN' })
  }

  if (agreedAmount == null) {
    problems.push({ kind: 'PRICE_UNCONFIRMED' })
  } else if (priceLines.length === 1 && Math.round(priceLines[0].amount) !== Math.round(agreedAmount)) {
    problems.push({ kind: 'PRICE_MISMATCH', sheetAmount: priceLines[0].amount, agreedAmount })
  }

  return problems
}

export function reconcileProblemMessage(p: ReconcileProblem): string {
  switch (p.kind) {
    case 'EMPTY':
      return 'Add at least one line before sending this sheet.'
    case 'NO_PROPERTY_PRICE':
      return 'Add a "Property price" line — the sheet has to say what the property itself costs.'
    case 'MULTIPLE_PROPERTY_PRICE':
      return `There are ${p.count} "Property price" lines. Keep one, and put anything else under Charge.`
    case 'PROPERTY_PRICE_HIDDEN':
      return 'The property price line is marked internal. The buyer has to be able to see what the property costs.'
    case 'PRICE_UNCONFIRMED':
      return 'No agreed price has been confirmed by both parties yet, so there is nothing to reconcile this sheet against.'
    case 'PRICE_MISMATCH':
      return `The property price line is ${Math.round(p.sheetAmount).toLocaleString('en-IN')} but the confirmed agreed price is ${Math.round(p.agreedAmount).toLocaleString('en-IN')}. Correct one or the other before sending.`
  }
}
