# Backend ↔ Frontend Sync Check — 2026-07-26

Read-only review. Backend repo = this repo (`New Resale`). Frontend repo = `diggaj-realty/diggaj-realty-resale` (cloned read-only into a scratch dir to inspect, nothing pushed/changed in either repo).

Scope: cross-check everything changed on the backend this session against what the frontend actually consumes today.

## TL;DR

**Backend: done and verified** — every item below was implemented and tested live against the running API (not just read/assumed).

**Frontend: none of the new backend capabilities are wired up yet.** This is expected — the frontend was built against the *old* contract and nobody has touched it since. Nothing is broken by the backend changes (all additive/backwards-compatible), but four real features are sitting unused on the API with no UI:
1. Property status badge doesn't know about `UNDER_CONTRACT` (cosmetic gap, not a crash)
2. Deal document checklist has zero UI (bigger gap — staff can request docs the buyer/seller literally cannot see or fulfill)
3. Dual-role accounts (seller-can-also-buy) have no entry point anywhere
4. Elite plan upgrade request has no UI (the "Plans" page is static marketing copy with a "contact us" link)

Full breakdown below.

---

## 1. Property status — `UNDER_CONTRACT`

**Backend:** `Property.status` gained this value, set automatically the instant an offer is accepted. Locks the property out of search and new offers. Live-tested.

**Frontend:** ❌ Not handled.
- `types/api.ts:2-7` — `PropertyStatus` union is still `"DRAFT" | "PENDING_VERIFICATION" | "LIVE" | "REJECTED" | "CLOSED"`. `UNDER_CONTRACT` isn't in the type.
- Only place `property.status` renders at all: `components/dashboard/PropertyRow.tsx:23` (seller's "My Listings" panel) — prints the raw string with no badge/color. Compare to `components/dashboard/StatusBadge.tsx`, which already has a proper label/color map (with a safe gray fallback) but is only ever used for Offer/SiteVisit/Deal statuses, never Property.
- No crash risk (unrecognized string just renders literally, e.g. "UNDER_CONTRACT" as plain text) but no friendly label, no color, no explanation to the seller of why their listing looks the way it does.

**Frontend needs to:** add `UNDER_CONTRACT` to `PropertyStatus`, give it a label ("Sale in progress" or similar) and route `PropertyRow` through something like `StatusBadge` instead of raw text.

---

## 2. Deal document checklist (request → upload → review)

**Backend:** `GET /deals/:id/documents` (list), `PATCH /deals/:id/documents/:docId` (buyer/seller upload via `{fileUrl}`, staff review via `{status: APPROVED|REJECTED}`, buyer/seller cannot approve their own upload — enforced server-side, 403). This has existed on the backend for a while; today's session confirmed it works end-to-end with a live test and built the staff-side dashboard UI for it (request + review). **The buyer/seller upload UI was always meant to live in this frontend repo — it never got built.**

**Frontend:** ❌ Not handled at all.
- Zero matches anywhere in the repo for `docType`, `checklist`, `requiredFrom`, or the documents endpoints.
- There's no per-deal detail page at all — `GET /deals/:id` isn't called anywhere; buyer/seller "deals" are a flat card list (`ClosingPanel` / `DealsPanel`) showing payment milestones (agreedPrice, tokenAmount/Date, finalAmount/Date) and a static hard-coded 4-step progress tracker, plus a "contact your coordinator" link — no per-deal drill-in.
- **Good news:** the generic upload utility already exists and was seemingly built in anticipation of this — `lib/api/authed.ts:41-62` (`authedUpload`) already has `"deal-documents"` in its bucket union, it's just never called with that value. `components/seller/KycWizard.tsx` shows the exact pattern to mirror (pick file → upload → get URL → PATCH it in).

**Frontend needs to:** build a deal-detail view (or expand the existing panel) that lists required documents with status, lets the buyer/seller upload via the existing `authedUpload` pattern, and shows approved/rejected state + remarks. This is the highest-impact gap — right now staff can request a document that the customer has no way to ever see or act on.

---

## 3. Dual-role accounts (seller can also be a buyer)

**Backend:** `POST /api/v1/auth/roles` lets an existing account add the other role (BUYER↔SELLER) without a new signup. `roles: string[]` now returned from register/login/google/me. `GET /offers` and `GET /site-visits` accept `?as=buyer|seller` for accounts holding both. Live-tested.

**Frontend:** ❌ Not handled anywhere, and the app's architecture actively assumes single-role.
- `types/auth.ts` — `AuthUser.role` is a single field, no `roles` array. Even if the backend response now includes `roles`, it's dropped at the type boundary — nothing in the code can read it.
- No reference anywhere to `/auth/roles`, "add role", "become a buyer/seller", or similar.
- The app is split into two hard-coded shells from login onward — `app/login/buyer/page.tsx` vs `app/login/seller/page.tsx`, `app/dashboard/buyer/(shell)/...` vs `app/dashboard/seller/(shell)/...` — role is baked in at the login route, not something that can toggle at runtime. Profile page shows role as a static, non-editable badge.
- No `?as=` param used on offers/site-visits fetches (`lib/api/buyer.ts:23,40`) — both buyer and seller panels share the same fetch functions today, relying entirely on server-side scoping.

**Frontend needs to (if you want to expose this):** add `roles: string[]` to the auth types, add a way to add the second role (profile page action calling `/auth/roles`), and — the bigger lift — the two-shell architecture (`buyer/(shell)` vs `seller/(shell)`) would need either a role-switcher or a merged shell for a dual-role account to actually use both sides in one session. This is the largest architectural gap of the four; treat it as optional/backlog unless dual-role is an immediate priority.

---

## 4. Elite plan upgrade request

**Backend:** `POST /api/v1/listings/:id/request-plan` — seller-only, per-property, sets `Property.requestedPlan` (pending), notifies staff. Staff approve/reject from the internal dashboard (built this session). No payment yet — deliberately left as a seam for later. Live-tested, correctly scoped per-property.

**Frontend:** ❌ Not handled.
- `requestedPlan` doesn't exist anywhere in `types/api.ts` or the codebase (zero grep matches).
- No API call to `request-plan` anywhere in `lib/api/seller.ts`.
- The seller "Plans" page (`app/dashboard/seller/(shell)/plans/page.tsx` → `PlansPanel.tsx`) is static marketing copy listing BASIC/VERIFIED/VERIFIED_PLUS/ELITE tiers, ending in a "Contact us to upgrade →" link to `/contact`. It's not tied to any specific property and doesn't call the backend at all.
- `Property.plan` (BASIC/ELITE) itself IS already wired up correctly (Elite badges, `eliteOnly` search filter) — only the *request* flow is missing.

**Frontend needs to:** add a per-property "Request Elite" action (natural spot: `components/dashboard/PropertyRow.tsx` / `panels.tsx` in the seller's My Listings view, which currently has no action menu at all), call the new endpoint, and show pending state (`requestedPlan`) until staff approve/decline. `PlansPanel.tsx` should probably stop being purely static once this exists.

---

## Things frontend already gets right (no action needed)

- **Offer creation errors** (e.g. property not LIVE) — caught and shown cleanly via `ApiError`, no crash.
- **The offer-accept race-condition fix** (today's session) — frontend has no status-code branching and no incorrect retry-on-500 logic, so the fix is transparent: it'll just start seeing "This property already has a deal in progress" instead of an occasional generic failure. Nothing to change.
- **`displayStatus` vs raw `status`** on buyer-side offers — correctly used; seller-side correctly uses raw `status` since sellers never see `PENDING_REVIEW` anyway. `StatusBadge` also defensively labels both the same way regardless.
- **Site-visit cancel** — correctly gated on REQUESTED/SCHEDULED, matches backend's 400-on-already-closed rule.
- **`Property.plan` / Elite badges / `eliteOnly` search filter** — all pre-existing and working correctly, untouched by this session's changes.

Minor note: `SiteVisit.outcome` (agent's INTERESTED/NOT_INTERESTED call after a visit) isn't in the frontend's `SiteVisit` type and isn't displayed anywhere. Not a violation of anything, just an FYI if you ever want the buyer to see it.

---

## Suggested priority for frontend

1. **Deal documents UI** — biggest functional gap, actively blocks the paperwork flow today.
2. **Property status badge for `UNDER_CONTRACT`** — small, cosmetic, quick.
3. **Elite plan request** — self-contained, one new button + one new API call.
4. **Dual-role support** — largest lift (touches the two-shell architecture), treat as backlog unless there's near-term demand for sellers-who-also-buy.
