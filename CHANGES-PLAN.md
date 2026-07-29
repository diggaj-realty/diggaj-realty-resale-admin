# Buyer-journey rework — agreed change list

Working notes from walking the flow end to end: buyer saves a property → lead →
agent contact → site visit → negotiation → deal → closure. Numbering is stable;
refer to items by number in commits and PRs.

**Repo boundary:** this repo is the *internal* dashboard only. `dashboard/layout.tsx`
redirects BUYER and SELLER to `/login` — buyers and sellers use the public
marketing site + the `/api/v1` surface. Items marked **[FE]** belong to that
public frontend, not here.

Status: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Step 1 — Buyer saves a property

Saving currently writes one `Shortlist` row and nothing else: no lead, no
notification, no status guard. Decision: a save stays a bookmark.

- [ ] 1. Save stays a silent bookmark — no lead created
- [ ] 2. Staff-visible saves view; save counts surfaced on the listing
- [ ] 3. **[FE]** Post-save prompt (*show interest / know more*) → this creates the lead
- [ ] 4. Block saving non-LIVE listings (match the guard `createOrUpdateInterest` already has)

## Step 2 — Lead created

`createOrUpdateInterest` seeds the agent from `Property.agentId`, then freezes it.
No agent → broadcast to every active BACKEND + ADMIN.

- [ ] 5. Auto-assign an agent when the listing has none (rule TBD: round-robin / city / load)
- [ ] 6. **[FE]** Tell the buyer a lead exists and who owns it
- [ ] 7. Lead ageing + SLA escalation for unclaimed/uncontacted leads
- [ ] 8. Targeted staff notification instead of broadcast-to-all
- [ ] 9. Agents can claim unassigned leads themselves

## Step 3 — Buyer phone number

`User.phone` exists and both auth routes accept it, but it is optional
everywhere, so agents get leads with no number to call.

- [x] 10. Require phone at buyer signup — `POST /auth/register` now rejects a missing
      or malformed number (400). Google can't supply one, so that route returns
      `needsPhone` instead. **[FE]** still has to add the field to its signup form.
- [x] 11. Validate + normalize Indian mobile format — `src/lib/phone.ts`, applied at
      every write site (register, google, profile, public listing intake, staff signup)
- [x] 12. Tap-to-call + WhatsApp links on the lead detail; missing number flagged
- [x] 13. Decided: it **hard-blocks**, enforced in `createOrUpdateInterest` so no
      entry point can create an unreachable lead (`BUYER_PHONE_REQUIRED`, 422).
      Routes accept `buyerPhone` so **[FE]** can collect it in the same request.
- [~] 14. Phone-less leads flagged in the leads list. Backfill is small: of 26
      accounts holding the BUYER role, 18 are QA/probe artifacts and only 8 are
      real, all without a number — and 4 of those are the team's own. Three have
      live leads an agent currently cannot call. No migration or nag campaign
      needed; the **[FE]** prompt at the interest step covers it.

## Step 4 — Site visit scheduled off a phone call

Today an agent can only *propose*; the buyer must accept in-app. `scheduleSiteVisit`
books directly but only on an already-`REQUESTED` visit, and is AGENT-only.

- [ ] 15. Agent books a visit straight to `SCHEDULED` from an agreed call
- [ ] 16. Give BACKEND/ADMIN scheduling power — they have none today
- [ ] 17. Record how it was confirmed (`BUYER_ACCEPTED` vs `AGREED_OFFLINE`) + who
- [ ] 18. **[FE]** Buyer sees "confirmed after your call" + one-tap dispute back to proposal
- [ ] 19. Same offline-confirm path for reschedules, not just first booking

## Step 5 — Post-visit outcome

Already built: outcome capture (`INTERESTED` / `NOT_INTERESTED` /
`FOLLOW_UP_REQUIRED`), `interestedAmount`, and `createDealFromSiteVisit` which
skips the online offer flow entirely. Gaps are at the edges.

- [ ] 20. Merge complete + outcome into one post-visit form
- [ ] 21. Expand outcome vocabulary — no-shows, visit failed, revisit, negotiating vs deciding
- [ ] 22. Explicit **close lead** with a loss reason (feeds win/loss reporting)
- [ ] 23. Separate "not interested in this property" from "not interested at all"
- [ ] 24. Log offline negotiation rounds, not just the final figure
- [ ] 25. Let BACKEND/ADMIN complete + record outcomes, not only the owning agent
- [x] 26. Buyer confirms/disputes the agreed price before it becomes `Deal.agreedPrice`
      — done as part of step 9 (items 56, 60)
- [x] 27. On-site agreement → deal directly, skipping negotiation — already works, keep it

## Step 6 — Manual stage control (agent + backend)

`dealProgress.ts` computes all 12 stages from evidence — *"nothing writes them."*
Manual control turns the bar from a fact into a claim, so it is deliberately
hybrid: soft stages manual, hard stages evidence-gated.

- [x] 28. `Deal.manualStage` alongside the derived stage; `resolveDealStage` returns
      the furthest of the two plus which source won
- [x] 29. `DealStageControl` on the deal detail — forward, back, and "follow the records"
- [x] 30. Soft stages declarable: `SOFT_STAGES` in `dealProgress.ts`
- [x] 31. Hard stages refuse declaration (`NOT_DECLARABLE`, 409)
- [x] 32. Revert floored at the evidence (`BELOW_EVIDENCE`, 409)
- [x] 33. `DealStageChange` records actor, role, from, to, direction, reason, timestamp
- [x] 34. `source: DERIVED | DECLARED` exposed on `GET /deals/:id/stage`; internal UI
      labels it. **[FE]** still has to reflect it on the buyer-facing bar.
- [x] 35. Closure untouched — stage control refuses any finished deal (`DEAL_FINISHED`)
      and cannot reach `DEAL_CLOSED`; the configurable gate remains the only way to close
- [x] 36. `NEGOTIATION_RECORDED` is declarable, so the online offer module is now
      one route to it rather than the only one

## Step 9 — Negotiated price: recording, confirming, disputing

The offline-negotiation record already existed, but `buyerConfirmed` was a
checkbox the *agent* ticked — so "the buyer agreed to ₹1.7 Cr" was a claim by one
interested party. And the new stage control let an agent declare
`NEGOTIATION_RECORDED` with no figure at all.

- [x] 54. Declaring `NEGOTIATION_RECORDED` requires an `agreedAmount` and creates the
      `OfflineNegotiation` in the same action (`AMOUNT_REQUIRED`, 400)
- [x] 55. Agent-ticked `buyerConfirmed`/`sellerConfirmed` removed from the form and
      the API; staff record the figure, nothing more
- [x] 56. `POST /deals/:id/offline-negotiation/:negotiationId/respond` — BUYER/SELLER
      only, `action: confirm | dispute`
- [x] 57. An open dispute blocks stage *advancement* (`PRICE_DISPUTED`, 409); reverting
      stays possible so staff can walk a disputed deal back
- [x] 58. A corrected figure supersedes the old one and resets both confirmations;
      confirming a superseded record returns `SUPERSEDED`
- [ ] 59. **[FE]** Show the recorded price prominently with its confirmation state and
      the confirm/query actions — `GET /deals/:id/offline-negotiation` exposes
      `bothConfirmed`, `isDisputeOpen`, `isCurrent`, `disputedBy`, `disputedNote`
- [x] 60. `Deal.agreedPrice` updates only when both sides have confirmed (was item 26)
- [ ] 61. *(parked at your request)* Two-way messaging on `DealLogEntry`

## Step 10 — Cost sheet (full disclosure of what the buyer pays)

Structured line items rather than an uploaded PDF: the buyer can query one line,
the property-price line is checked against the confirmed price, and the numbers
stay reportable.

- [x] 62. `CostSheet` per deal — versioned, `DRAFT` → `SENT` → `SUPERSEDED`
- [x] 63. `CostSheetLine` — label, amount, category, note, `sharedWithBuyer`
- [x] 64. `reconcileCostSheet` blocks sending unless the `PROPERTY_PRICE` line matches
      the confirmed negotiated amount, is present exactly once, and is visible to
      the buyer (`RECONCILE_FAILED`, 409, with the specific problem)
- [x] 65. Lines default to internal; the buyer's view strips them and recomputes the
      total from what remains, so a hidden line can't be inferred from the arithmetic
- [x] 66. `STATUTORY` lines carry `isEstimate` and are labelled as estimates in the UI
- [x] 68. Buyer acknowledges, or queries a specific line; an open query blocks stage
      advancement (`COST_SHEET_QUERIED`, 409) exactly as a disputed price does
- [x] 67. Revising copies the sent sheet into a new DRAFT and leaves the sent one
      untouched until the revision is sent; the buyer re-acknowledges the new version
- [ ] 69. Attach the formal PDF via the existing `DealDocument` — not built
- [x] 70. Authored by the deal's agent **or** backend/admin; both see every version
      and every line
- [ ] 73. **[FE]** Buyer-facing view of the sent sheet with acknowledge / query-a-line
      actions — `GET /deals/:id/cost-sheet` returns the buyer-safe shape, and
      `POST /deals/:id/cost-sheet/:sheetId/respond` is BUYER-only
- [ ] 71. *(later)* Templates per builder/project
- [ ] 72. *(later)* Generate `PaymentRequest`s from cost-sheet lines

## Step 7 — Structural gaps

- [x] 37. Terminal failure status for deals (`FELL_THROUGH`) with a reason
- [x] 38. Return the property to `LIVE` when a deal collapses
- [x] 39. One *active* deal per property instead of one deal ever, so a second attempt is possible
- [ ] 40. Resolve `unitsAvailable` vs one-deal-per-property — make units real or drop the field
- [ ] 41. Give sellers their own progress view of the deal
- [ ] 42. WhatsApp/SMS delivery for key events, reusing the phone from step 3
- [ ] 43. Buyer-level lead ownership, or cross-lead visibility so agents don't collide
- [ ] 44. Finish consolidating the three offer-acceptance paths

## Step 8 — Dashboard UI + navigation

`navConfig.ts` admits the problem in a comment: BACKEND/ADMIN reach 11-12 links
that *"wrap or overflow on real laptop widths."* Counts today — BUYER 11 (dead
code), AGENT 12, BACKEND 14, ADMIN 14, all flat.

- [ ] 45. Group nav into Pipeline / Inventory / People / Setup
- [ ] 46. Collapse Leads + Site Visits + Negotiations + Accepted Offers + Deals into one **Pipeline** view with stage columns
- [ ] 47. Manual stage control (28–36) lives on that Pipeline view
- [ ] 48. Agent landing page = today's work queue, not a nav grid
- [ ] 49. Move Amenities into Settings; keep Performance/Feedback/Help out of primary nav
- [ ] 50. Delete the dead BUYER nav branch (`navConfig.ts`)
- [ ] 51. Reconcile ADMIN vs BACKEND navs — merge or genuinely differentiate
- [ ] 52. Apply the Behance visual direction (orange/yellow/blue/black, Urbanist, hero banner)

---

## Build order

1. **37–39** — actively dangerous: a collapsed deal currently bricks the listing forever
2. **10–14** — phone, since agent contact and WhatsApp both depend on it
3. **28–36** — the manual stage control
4. **45–52** — nav/UI, after the pipeline consolidation is settled
5. Everything else
