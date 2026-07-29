/** Post-visit outcomes and lead-loss reasons. Pure/no imports — must stay
 *  importable from client components without dragging in Prisma/pg. Same
 *  constraint as statusTone.ts and phone.ts. */

/** What actually happened at the visit.
 *
 *  The original three — interested, not interested, follow up — could not express
 *  most of what agents came back with. A no-show, a visit that could not go ahead,
 *  a buyer wanting a second look, and a buyer mid-negotiation all collapsed into
 *  FOLLOW_UP_REQUIRED plus a free-text note, which meant none of it was reportable
 *  and the lead's status could not reflect reality.
 *
 *  FOLLOW_UP_REQUIRED is kept so existing records stay readable, but it is split
 *  for new ones: NEGOTIATING (talking money) and DECIDING (thinking it over) need
 *  different chasing.
 */
export const VISIT_OUTCOMES = [
  'INTERESTED',
  'NEGOTIATING',
  'DECIDING',
  'REVISIT_REQUESTED',
  'NOT_INTERESTED',
  'BUYER_NO_SHOW',
  'SELLER_NO_SHOW',
  'VISIT_FAILED',
  'FOLLOW_UP_REQUIRED',
] as const

export type VisitOutcome = (typeof VISIT_OUTCOMES)[number]

export const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  INTERESTED: 'Interested — price agreed',
  NEGOTIATING: 'Negotiating on price',
  DECIDING: 'Thinking it over',
  REVISIT_REQUESTED: 'Wants another visit',
  NOT_INTERESTED: 'Not interested',
  BUYER_NO_SHOW: 'Buyer did not turn up',
  SELLER_NO_SHOW: 'Seller / key holder did not turn up',
  VISIT_FAILED: 'Visit could not happen',
  FOLLOW_UP_REQUIRED: 'Follow up needed',
}

/** Outcomes shown when recording a fresh visit. FOLLOW_UP_REQUIRED is excluded —
 *  it is the vague bucket the specific outcomes above replace. */
export const SELECTABLE_VISIT_OUTCOMES: VisitOutcome[] = VISIT_OUTCOMES.filter(
  (o) => o !== 'FOLLOW_UP_REQUIRED'
)

/** Only an agreed price makes a deal possible, so only this outcome collects one. */
export function outcomeNeedsAmount(outcome: string): boolean {
  return outcome === 'INTERESTED' || outcome === 'NEGOTIATING'
}

/** Outcomes where the visit did not actually take place. Worth separating for
 *  reporting: a no-show is an operations problem, not a lost buyer. */
export function outcomeMeansVisitDidNotHappen(outcome: string): boolean {
  return outcome === 'BUYER_NO_SHOW' || outcome === 'SELLER_NO_SHOW' || outcome === 'VISIT_FAILED'
}

export function isVisitOutcome(value: string): value is VisitOutcome {
  return (VISIT_OUTCOMES as readonly string[]).includes(value)
}

/** The lead status each outcome implies.
 *
 *  A no-show leaves the lead where it was rather than advancing it — nothing was
 *  learned about the buyer's intent, so pretending the visit completed would let
 *  it drift out of the follow-up queue. */
export function leadStatusForOutcome(outcome: string): string | null {
  switch (outcome) {
    case 'INTERESTED':
      return 'INTERESTED'
    case 'NEGOTIATING':
      return 'NEGOTIATION_IN_PROGRESS'
    case 'NOT_INTERESTED':
      return 'NOT_INTERESTED'
    case 'DECIDING':
    case 'FOLLOW_UP_REQUIRED':
      return 'SITE_VISIT_COMPLETED'
    case 'REVISIT_REQUESTED':
      return 'SITE_VISIT_COMPLETED'
    // No-shows and failed visits say nothing about intent — leave the lead alone.
    default:
      return null
  }
}

/** Why a lead was lost.
 *
 *  Closing used to mean setting NOT_INTERESTED, which left dead leads sitting in
 *  the queue looking open and recorded nothing about why. These codes are the only
 *  why-we-lose data the platform gets, so the reason is required rather than
 *  optional. */
export const LEAD_LOSS_REASONS = [
  'PRICE_TOO_HIGH',
  'BOUGHT_ELSEWHERE',
  'LOCATION',
  'PROPERTY_CONDITION',
  'FINANCING',
  'UNRESPONSIVE',
  'NOT_SERIOUS',
  'TIMING',
  'OTHER',
] as const

export type LeadLossReason = (typeof LEAD_LOSS_REASONS)[number]

export const LEAD_LOSS_LABELS: Record<LeadLossReason, string> = {
  PRICE_TOO_HIGH: 'Price too high',
  BOUGHT_ELSEWHERE: 'Bought somewhere else',
  LOCATION: 'Location did not suit',
  PROPERTY_CONDITION: 'Condition of the property',
  FINANCING: 'Could not arrange financing',
  UNRESPONSIVE: 'Stopped responding',
  NOT_SERIOUS: 'Not a serious buyer',
  TIMING: 'Not buying right now',
  OTHER: 'Other',
}

export function isLeadLossReason(value: string): value is LeadLossReason {
  return (LEAD_LOSS_REASONS as readonly string[]).includes(value)
}

/** Whether losing this lead says anything about the buyer as a whole.
 *
 *  "Price too high" and "location did not suit" are about *this property* — the
 *  buyer is still worth showing others, and treating them as gone loses a warm
 *  lead. "Bought elsewhere" and "not buying right now" are about the buyer, so
 *  their other leads are moot too. */
export function lossEndsBuyerInterest(reason: string): boolean {
  return reason === 'BOUGHT_ELSEWHERE' || reason === 'TIMING' || reason === 'NOT_SERIOUS'
}
