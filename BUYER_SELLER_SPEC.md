# Buyer & Seller Experience — Product Spec for Frontend Team

**Audience:** Frontend engineers building the buyer-facing and seller-facing web/app experience (the public site — `list.diggajrealty.com` style properties + a consumer browse/buy app). This is separate from the internal `/dashboard`, which is staff-only (Admin, Backend Ops, Agent) — **Buyers and Sellers are explicitly blocked from `/dashboard`** (`src/app/dashboard/layout.tsx` redirects them to `/login`). Everything for Buyers and Sellers must be built as its own consumer surface, talking to the `/api/v1/*` REST API described below.

This doc explains **who the two consumer roles are, what they can do, in what order, and every screen/option they need** — based on what already exists in the backend (Prisma schema + API routes) plus a competitive feature audit of 99acres, NoBroker, Housing.com and MagicBricks.

---

## 1. The two consumer roles

| Role | Who they are | Core job to be done |
|---|---|---|
| **SELLER** | Owns a property and wants to sell it (resale, not new-build). Includes "referred" sellers submitted by someone else via a no-signup link. | List a property accurately, get it verified, receive and negotiate offers, close the deal. |
| **BUYER** | Looking to buy a resale property. | Search/filter properties, shortlist, get alerted on new matches, make offers, book site visits, track a deal to close. |

A third role, **AGENT**, sits between the two on-platform (assigned to a listing and/or a deal) but agents work from the internal dashboard, not the consumer app — treat agent-facing surfaces as out of scope for this doc, but note where buyers/sellers see agent info (e.g. "Contact your agent").

Everything a Buyer/Seller does is mediated by two internal roles that are **not** part of this app but shape the flow: **BACKEND** (ops staff who verify KYC, review every listing before it goes live, and broker every offer) and **ADMIN**. Design the buyer/seller UI assuming a human always reviews KYC docs, listings, and offers before anything reaches the other party — this is a trust/safety-by-design platform, not a self-serve marketplace. Set buyer/seller expectations accordingly (e.g. "Under review — usually within 24 hours", not instant publish).

---

## 2. Account & auth (both roles)

- **Register**: name, email, phone, password, role (SELLER or BUYER) — `POST /api/v1/auth/register`.
- **Login**: email + password — `POST /api/v1/auth/login`.
- **Session/me**: `GET /api/v1/auth/me`.
- **Profile**: view/edit name, phone, email, avatar — `GET/PATCH /api/v1/profile`; change password — `POST /api/v1/profile/password`.
- **Notification preferences**: email + push toggles live on the user record (`emailNotifications`, `pushNotifications`) — surface as a Settings screen.
- **Notifications inbox**: `GET /api/v1/notifications`, mark one/all read — `POST /api/v1/notifications/[id]/read`, `POST /api/v1/notifications/read-all`. Every state change (offer forwarded, KYC approved, listing rejected, visit scheduled, etc.) creates one of these — this is the backbone of "what happened to my thing" for both roles. Build a persistent bell/badge with unread count.

**Screens needed:** Register, Login, Forgot/Reset password (if in scope), Profile & Settings, Notification preferences, Notifications inbox.

---

## 3. SELLER flow

### 3.1 Entry points
1. **Self-registration** → normal SELLER account.
2. **No-signup public submission link** (`POST /api/v1/public/listings`, embedded at `list.diggajrealty.com` / `/embed/list-property`) — someone (often an agent's referral) fills the listing form with the seller's name/phone/email and no login is required. A placeholder SELLER account is silently created behind it. This means: **build the public listing form as a fully separate, unauthenticated flow** distinct from the logged-in "Add Listing" flow, even though they submit overlapping data. Include an optional `referralName` field ("Who referred you?").

### 3.2 KYC (required before real trust, gates going LIVE in practice)
- Submit ID type, ID document (upload first via `POST /api/v1/uploads`, bucket `kyc-documents`), and a selfie — `GET/POST /api/v1/kyc`.
- Status: `PENDING → APPROVED` or `REJECTED` (with `remarks` explaining why, resubmission allowed).
- **Screen:** KYC wizard (choose ID type → upload doc → upload selfie → submit → status card with remarks-if-rejected and a "Resubmit" action). Show a persistent banner anywhere in the seller app while KYC isn't approved (mirrors `KycBanner` on the internal dashboard).

### 3.3 Create / edit a listing
Property type: `RESIDENTIAL | PLOT | COMMERCIAL`. Full field set the form must support (all optional except the required ones noted):

- **Required:** title, description, location (free text), type, areaSqft, askingPrice. `bhk` required for RESIDENTIAL/COMMERCIAL, not applicable to PLOT.
- **Structured location:** city (dropdown from a canonical Indian-city list with alias normalization, e.g. "Bengaluru"→"Bangalore"), locality, pincode, latitude/longitude (map pin drop).
- **Area breakdown:** carpetAreaSqft, builtUpAreaSqft, superBuiltUpAreaSqft (RERA requires carpet area to be disclosed — surface all three distinctly, don't collapse into one "area" field).
- **Configuration:** bathrooms, balconies, furnishing (`UNFURNISHED | SEMI_FURNISHED | FULLY_FURNISHED`), facing (8-point compass), floorNumber/totalFloors, ageYears, parkingCovered/parkingOpen (counts, not booleans).
- **Legal/commercial:** possessionStatus (`READY_TO_MOVE | UNDER_CONSTRUCTION`), possessionDate, ownershipType (`FREEHOLD | LEASEHOLD | POWER_OF_ATTORNEY | CO_OPERATIVE`), reraId, priceNegotiable (bool), maintenanceMonthly.
- **Builder/project:** builderName, projectName (useful for apartment resales — lets buyers search by project).
- **Media:** photos (multiple, ordered) + videos, floorPlanUrl. Upload via `POST /api/v1/uploads`, then attach URLs to the property. **Enforce `maxPhotosPerListing` from AppConfig** (currently 15) client-side with a clear counter.
- **Amenities:** multi-select checklist. Pull the **active** list from `GET /api/v1/amenities` (falls back to a 14-item default set if the admin master is empty) — never hardcode the checklist in the seller app, it must reflect the admin-managed list.
- **unitsAvailable**: stock count — same physical listing can represent >1 identical unit (e.g. multiple flats in one project). Surface as a simple stepper, default 1.

Listing lifecycle status the seller sees: `DRAFT → PENDING_VERIFICATION → LIVE`, with terminal states `CLOSED` (deal done) and `REJECTED` (with a reason, resubmittable back to DRAFT). Every listing starts DRAFT and needs backend approval to go LIVE (unless `listingApprovalRequired` is off in AppConfig, which the frontend should not assume).

**Seller plan tiers** (`plan` field): `BASIC | VERIFIED | VERIFIED_PLUS | ELITE`. AppConfig exposes `verifiedPlanPrice`/`elitePlanPrice`. Build a plan-comparison/upgrade screen even if payment isn't wired yet — ELITE listings get an `eliteOnly` filter boost on buyer search, so sellers should understand the incentive to upgrade.

**Screens needed:** My Properties (list with status pills, edit/delete, "boost to Verified/Elite" CTA), Add/Edit Listing (multi-step form matching the field groups above), Listing detail/preview (what a buyer will see), Photo/video manager.

> API note: `GET /api/v1/site-visits` was extended to accept `SELLER` — a seller sees (read-only) the visits requested on their own properties, scoped by `property.sellerId`. Use this for §3.6 below rather than waiting on a new endpoint.

### 3.4 Offers received & negotiation
Sellers **never see an offer the moment it's made** — every offer starts `PENDING_REVIEW` and only becomes visible to the seller once backend forwards it (`GET /api/v1/offers` for SELLER excludes `PENDING_REVIEW`). Statuses a seller can encounter: `PENDING → ACCEPTED | REJECTED | COUNTERED`. `counterAmount`/`counterBy` show who last moved the number (`'BACKEND'` or `'SELLER'`) — an `OfferEvent` audit trail (`CREATED, FORWARDED, COUNTERED_BACKEND, COUNTERED_SELLER, ACCEPTED, REJECTED, COUNTER_ACCEPTED, COUNTER_REJECTED`) backs a full timeline UI. **Design this as a negotiation thread/timeline component, not a flat "offer amount" row** — sellers should see the back-and-forth.

Seller actions on a forwarded offer: Accept, Reject, Counter (enter new amount, optional note).

**Screens needed:** Offers list (grouped by property), Offer detail with negotiation timeline + accept/reject/counter actions.

### 3.5 Deals (post-acceptance)
Once an offer is accepted, a `Deal` is created: agreedPrice, tokenAmount/tokenDate (booking token), finalAmount/finalPaymentDate, paymentMode (`BANK_TRANSFER | CHEQUE | OTHER`), transactionRef, notes, commissionAmount, status (`IN_PROGRESS → CLOSED`). Sellers should have a read view of deal progress and payment milestones (token received? final payment received?) even if backend/agent does the heavy data entry — this is where "is my sale actually closing" anxiety lives, so don't hide it behind a support ticket.

**Screens needed:** My Deals (list), Deal detail (timeline: offer accepted → token received → final payment → closed; shows agent contact if assigned).

### 3.6 Site visits
Sellers don't request visits (buyers do) but can **see upcoming visits scheduled on their property** and any agent feedback logged post-visit via `GET /api/v1/site-visits` (now role-aware for SELLER, read-only — no schedule/cancel actions for this role).

---

## 4. BUYER flow

### 4.1 Browse & search
Filter shape (`PropertyFilters` in `propertySearch.ts`) — build the search UI around exactly these facets so saved-search and browse stay consistent:
- Free text `q` (matches title, location, city)
- `type` (RESIDENTIAL/PLOT/COMMERCIAL)
- Price range (`minPrice`/`maxPrice`)
- `minBhk`, `minBathrooms`
- `city` (canonical dropdown), `locality` (contains-match), `pincode`
- Area range (`minArea`/`maxArea`)
- `furnishing`, `facing`, `possessionStatus`, `maxAgeYears`
- `parking` (boolean — has covered or open parking)
- `ownershipType`
- `amenities` (multi-select, matches listings with **all** selected amenities — `hasEvery`, so warn users that stacking many amenities narrows results fast)
- `eliteOnly` (toggle for premium listings only)
- Sort: `newest | price_asc | price_desc | area_asc | area_desc | most_viewed`

Only `LIVE` properties are ever returned to buyers — never design a buyer-facing state for DRAFT/PENDING/REJECTED listings.

**Screens needed:** Search/browse (filter sidebar or bottom sheet + result grid/list toggle, map view is a strong competitive add — see §6), Property detail page (full field display: gallery, price, area breakdown, configuration, amenities grid, location map, builder/project name, RERA id, agent/seller contact-reveal, similar properties), Saved filters chips.

### 4.2 Shortlist ("wishlist")
Simple toggle-per-property, `POST /api/v1/shortlists`, `DELETE /api/v1/shortlists/[propertyId]`. **Screen:** Shortlist page — grid of saved properties, quick-remove, quick-compare entry point (see §6 recommendations).

### 4.3 Saved searches + alerts
Buyers can name and save a filter combination with `alertsEnabled`; a backend job (`run-alerts`) scans for new matches. **Screen:** Saved Searches list (name, filter summary chips, alerts on/off toggle, "run now"/last-alerted timestamp, delete), plus a one-tap "Save this search" action from the browse screen that reuses the current filter state.

### 4.4 Making an offer
`POST /api/v1/offers` with propertyId, amount, optional message. Property must be LIVE. Offer starts `PENDING_REVIEW`. **Buyer-facing status is intentionally collapsed**: `displayStatus` merges `PENDING_REVIEW`/`PENDING` into a single "Pending" so buyers don't see the internal review step — always render `displayStatus`, never the raw `status`, in buyer UI. Once backend/seller respond, buyer sees `ACCEPTED | REJECTED | COUNTERED` and can accept/reject a seller counter.

**Screens needed:** "Make an offer" modal/sheet from property detail, My Offers list (grouped by property, with negotiation timeline same component style as seller side), Offer detail with respond-to-counter actions.

### 4.5 Site visits
`POST /api/v1/site-visits` — propertyId, requestedDate, optional buyerNote. Auto-assigns the property's agent if one exists. Status: `REQUESTED → SCHEDULED → COMPLETED | CANCELLED`. Gate this feature on `AppConfig.siteVisitsEnabled` (API already 403s if disabled — handle that error state gracefully, e.g. "Site visits are temporarily paused"). **Screens needed:** "Request a visit" form (date/time picker + note) from property detail, My Site Visits list with status pills and scheduled date once confirmed.

### 4.6 Deals
Same `Deal` model as sellers — buyer gets a read/track view once their offer is accepted, mirroring §3.5.

### 4.7 Property view tracking
Every detail-page view should fire `POST /api/v1/properties/[id]/views` (drives `viewCount` and the "most viewed" sort/`most_viewed` and trending surfaces) — make this a fire-and-forget call on page load, not blocking render.

---

## 5. Cross-cutting UX principles to carry into design

1. **Always show "why is this pending"** — both roles interact with a system that inserts human review at almost every step (KYC, listing approval, offer forwarding). Every pending state needs a plain-language explanation and a rough time expectation, or support tickets will spike.
2. **One negotiation-timeline component**, reused for offers (buyer view and seller view, same events, different framing) — don't build two separate offer UIs.
3. **Notifications are the source of truth for "what changed"** — badge count in the header nav on every screen, not just a dedicated inbox page.
4. **Never expose raw enum values** in buyer/seller UI — map every status/enum to a human label and a color (mirrors `StatusPill`/`buyerFacingOfferStatus` patterns already in the codebase).
5. **Amenities and city lists must be data-driven** (fetched from `/api/v1/amenities`, and the CITIES constant) not hardcoded — the admin team manages both centrally.

---

## 6. Feature gaps vs. competitors — 99acres, NoBroker, Housing.com, MagicBricks

Researched what these four India-market leaders offer that this platform's schema/API doesn't yet cover. Grouped by priority. None of these require new roles — they're buyer/seller surface enhancements, mostly presentation + a few new small data points.

### Now (high value, low lift — mostly UI/derived data, little/no schema change)
- **EMI calculator** on property detail (pure client-side math off `askingPrice` — no backend change). All four competitors lead with this.
- **Price per sqft** shown prominently (derive from `askingPrice / areaSqft`, plus carpet-area variant) — the #1 number serious buyers scan for.
- **"Similar properties"** rail on detail page (same city + type + BHK ± price band — a variant of the existing browse query, no schema change).
- **Recently viewed** properties (client-side/localStorage, or persist via `PropertyView` already being recorded per-user).
- **Share listing** (WhatsApp/copy-link) — every competitor treats WhatsApp share as a primary CTA, not an afterthought, since Indian real-estate discovery is heavily word-of-mouth.
- **Verified badge** on listing cards (`plan !== 'BASIC'` or KYC-approved seller) — surface trust signal at a glance in browse grid, not just on detail page.
- **Locality/city price trend blurb** ("Avg. price in {locality}: ₹X/sqft, up/down N% vs last quarter") — Housing.com and 99acres both anchor this on every locality page; requires an aggregation query over `askingPrice`/`areaSqft` grouped by city/locality, no schema change.
- **Compare properties** (side-by-side, 2–3 shortlisted properties) — pure frontend feature over existing shortlist data.
- **Contact-reveal gating** ("Show phone number" click-to-reveal rather than always-visible) — matches NoBroker/99acres pattern, reduces spam, easy to add as a UI interaction over existing `sellerName`/`agentName` fields (would need phone added to the DTO, currently only name is exposed — flag to backend).

### Next (moderate lift — needs a small schema/API addition)
- **Price-drop alerts**: notify buyers who shortlisted/saved-searched a property when `askingPrice` decreases. Needs an audit of price changes (simple: compare on update, fire notification) — no new model required, just a hook in the property-update path.
- **Map-based search** (pin clusters, draw-a-radius) — `latitude`/`longitude` already exist per property; this is primarily a frontend map-library integration (Google Maps/Mapbox) plus a bounding-box variant of `buildPropertyWhere`.
- **RERA verification display** — `reraId` field already exists; add a "Verify on RERA" outbound link and a green "RERA Registered" chip when present. (99acres/MagicBricks both foreground this for trust.)
- **Structured possession timeline / construction progress** for UNDER_CONSTRUCTION listings (photo-dated progress updates) — currently only `possessionDate` exists; would need a small `PropertyProgressUpdate` model if sellers want to post updates. Log as a backlog item, not required for v1.
- **Neighborhood info** (schools/hospitals/transit nearby) — typically sourced from a places API (Google Places) keyed off lat/long already stored; no schema change, but needs a paid API key decision.
- **Video KYC / video property tour** — `videoUrl`/`videos` already modeled for listings; a scheduled video-call site-visit variant (vs. in-person) is a NoBroker specialty worth considering as an alternate `SiteVisit` mode — would need a `mode: IN_PERSON | VIDEO` field on `SiteVisit`.

### Later (bigger lift — new capability, sequence after core flows ship)
- **In-app chat** between buyer and seller/agent (currently only offers + notifications carry messages; NoBroker's differentiator is direct chat). Needs a new `Message`/`Conversation` model.
- **Home loan / EMI partner integration** (lead-gen to lender partners) — 99acres/Housing.com both monetize here. Needs a partner integration decision, not just UI.
- **Brokerage-free filter / "owner only" toggle** — NoBroker's core wedge. This platform already tracks `agentId` per property, so an "owner-listed only" filter (`agentId == null`) is a **Now**-tier addition actually — cheap, just flagging it here because it's conceptually a "Later" competitive positioning decision for product, not engineering.
- **Neighborhood/society reviews** (ratings on a building/project, keyed by `projectName`) — needs a new `ProjectReview` model tied to `projectName`.
- **Legal document checklist / e-signing** for deal closure — `Deal` currently tracks payments/notes only; a document checklist (sale deed, NOC, encumbrance certificate, etc.) with upload + status per item would need a `DealDocument` model.

---

## 7. Open questions for product before frontend locks screens

1. Should the buyer/seller DTOs expose the counterparty's **phone number** (currently only `name`) to support click-to-reveal (§6 Now)? Needs a privacy/consent decision (masked number / call-relay vs. raw reveal).
2. Confirm whether `listingApprovalRequired` can ever be off in production — if yes, the seller app needs a "went live immediately" success state, not just "submitted for review."
3. Payment collection for `VERIFIED`/`ELITE` seller plans — is this Vercel Marketplace-integrated (Razorpay/Stripe) or handled off-platform? Determines whether "Upgrade plan" is a checkout flow or a "contact us" CTA in v1.
