# Diggaj Realty Resale — Complete Platform Flow & API Reference

This is a **single, self-contained document** for the frontend team (the buyer/seller-facing consumer app). It covers everything: how the system is split, every screen/button and what happens when it's used, the exact API contract (endpoints, request/response bodies, JSON shapes), every notification, every error code, and a prioritized list of what still needs building on the frontend. Nothing here is guessed — every endpoint and behavior was read from the actual backend code and, for anything changed this session, tested live against the running server.

---

## 0. How the system is split (read this first)

There are **two separate apps** talking to **one backend**:

1. **The public frontend** (this is you) — what BUYER and SELLER accounts use. Talks to the backend only via a bearer-token REST API at `/api/v1/*`.
2. **The internal staff dashboard** — what AGENT, BACKEND (ops), and ADMIN accounts use, session-cookie based, a completely different auth system. **BUYER and SELLER accounts can never log into this dashboard.**

**Base URL**: `https://diggaj-realty-resale-admin.vercel.app/api/v1` (live, backed by the real Supabase DB).

**CORS is open** (`Access-Control-Allow-Origin: *`) — callable from any origin/port, including local dev.

**Response envelope**, always:
- Success: `{ "data": ... }` (2xx)
- Error: `{ "error": { "message": "..." } }` (4xx/5xx) — `message` is written to be shown directly to the user.
- Paginated lists: `{ "data": { "items": [...], "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }` — control with `?page=`/`?pageSize=` (capped at 100).

**Auth header** on every authenticated request: `Authorization: Bearer <jwt>` — token comes from register/login/Google, valid 30 days.

---

## 1. Status & enum reference (keep this open while reading the rest)

**User.role / roles**: `BUYER | SELLER | AGENT | BACKEND | ADMIN | PENDING`. An account can hold **multiple** of BUYER/SELLER simultaneously — see §3.5.

**Property.status**: `DRAFT → PENDING_VERIFICATION → LIVE → UNDER_CONTRACT → CLOSED`, or `REJECTED` as a dead-end branch.
- `DRAFT` — submitted, awaiting backend review (the name is misleading — it's not "not yet submitted").
- `PENDING_VERIFICATION` — used interchangeably with DRAFT for the review queue.
- `LIVE` — approved, publicly searchable, buyers can offer/request visits.
- `UNDER_CONTRACT` — set automatically the instant an offer is accepted. Out of search, no new offers. Distinct from CLOSED (deal in progress vs. legally finished).
- `CLOSED` — deal has closed.
- `REJECTED` — backend rejected the listing.

**Property.plan**: `BASIC | ELITE`. **Property.requestedPlan**: `null | "ELITE"` — see §3.6.

**SiteVisit.status**: `REQUESTED → SCHEDULED → COMPLETED`, or `CANCELLED` branch.
**SiteVisit.outcome**: `null | INTERESTED | NOT_INTERESTED` — agent-set, read-only to buyer/seller.

**Offer.status**: `PENDING_REVIEW → PENDING → ACCEPTED`, or `REJECTED` / `COUNTERED` / `NEGOTIATION_CLOSED` as branches.
- `PENDING_REVIEW` = buyer submitted, backend hasn't forwarded to seller yet — **never show this raw string to a buyer**, use `displayStatus` (collapses `PENDING_REVIEW`+`PENDING` into buyer-facing `"PENDING"`).
- `COUNTERED` can be entered and re-entered **repeatedly** — negotiation has no round limit (see §5).
- `NEGOTIATION_CLOSED` — either party (or staff) ended the conversation with no agreement. Distinct from `REJECTED` (one side said no to a specific number).

**Deal.status**: `IN_PROGRESS | CLOSED`.

**DealDocument.status**: `PENDING → UPLOADED → APPROVED`, or `REJECTED` branch (back to needing re-upload).

**SellerKyc.status**: `PENDING | APPROVED | REJECTED`.

---

## 2. Auth: register, login, Google, KYC

### 2.1 Register — `POST /api/v1/auth/register`
```
Content-Type: application/json
{ "name": "Aisha Khan", "email": "aisha@example.com", "password": "at-least-8-chars", "phone": "9876543210", "role": "BUYER" }

→ 201 { "data": { "token": "<jwt>", "user": { id, name, email, phone, role, roles, isActive, createdAt, updatedAt } } }
```
- `role` must be `"BUYER"` or `"SELLER"` (case-insensitive) — public self-serve signup only creates these two. AGENT/BACKEND/ADMIN are provisioned internally.
- `phone` optional; `name`, `email`, `password` (min 8 chars) required.
- `409` if email already registered, `400` for validation errors.
- **Log the user in immediately with the returned token** — no separate login call needed.

### 2.2 Login — `POST /api/v1/auth/login`
```
{ "email": "buyer@demo.test", "password": "password123" }
→ 200 { "data": { "token": "<jwt>", "user": {...} } }
```
Wrong password/nonexistent email → `401`. A `PENDING` (unapproved staff signup) account can't log in anywhere — `isActive: false` until admin-approved (not relevant to your BUYER/SELLER flows).

### 2.3 Google Sign-In — `POST /api/v1/auth/google`

**Setup — Google Identity Services (GIS)**, using this Client ID (already provisioned, shared with the internal dashboard, no separate Google Cloud setup needed):
```
721185759856-h1ka6128h2opd8hmnlab78n5qjak87ab.apps.googleusercontent.com
```
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```
```js
google.accounts.id.initialize({
  client_id: '721185759856-h1ka6128h2opd8hmnlab78n5qjak87ab.apps.googleusercontent.com',
  callback: handleGoogleResponse,
})
google.accounts.id.renderButton(document.getElementById('google-btn'), { theme: 'outline', size: 'large' })
```
**Nothing about this is automatic** — add a mount element (`<div id="google-btn">`) on your login/signup screen and call `renderButton()` pointing at it. Google draws the button itself once you do.

**Send the ID token to the API:**
```js
async function handleGoogleResponse(response) {
  const res = await fetch('https://diggaj-realty-resale-admin.vercel.app/api/v1/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: response.credential,   // from GIS
      role: 'BUYER',                  // or 'SELLER' — whichever flow the user is in
      phone: undefined,               // optional
    }),
  })
  const { data } = await res.json()
  // data.token      → bearer token, store exactly like after register/login
  // data.user       → { id, name, email, role, roles, ... }
  // data.isNewUser  → true on this Google account's first-ever sign-in here
}
```

**Response codes:**
- `200` — existing account, signed in.
- `201` — brand-new account created (`isNewUser: true`) — good moment for a "complete your profile" step.
- `401` — bad/expired/wrong-audience Google token, or unverified email. Treat like any failed sign-in.
- `409` — email already registered as internal staff. Show something like "This email is used internally — please use a different Google account."

**Dual-role behavior (new)**: if a *returning* user requests a `role` they don't already have, it's **automatically added** to their account instead of being ignored — e.g. a SELLER signs in with `role: "BUYER"` and becomes dual-role on the spot, no confirmation step. If you want to surface this ("you can now also buy on this account"), compare `roles` before/after — the response doesn't flag it explicitly.

**Domain checklist**: your frontend's domain must be in Google Cloud OAuth client's **Authorized JavaScript origins**. `https://diggajrealty.com` is already added — confirm that's your real production domain, and flag any local dev origins (e.g. `http://localhost:3000`) that need adding, or the button fails with an origin-mismatch error.

**Optional**: Google One Tap (`google.accounts.id.prompt()`) — separate from the button, most apps skip it.

### 2.4 Get current user — `GET /api/v1/auth/me`
No body. Returns current user, validated against the DB (deactivation caught immediately, not just at token expiry). Use on app launch to confirm the stored token is still valid.

### 2.5 Profile — `PATCH /api/v1/profile`
`{ name, phone }`. Any authenticated role.

### 2.6 Change password — `POST /api/v1/profile/password`
`{ currentPassword, newPassword (min 8 chars) }`. Wrong current password → `400`.

### 2.7 KYC (seller-only, required before listing)
A SELLER must have `SellerKyc.status === "APPROVED"` before creating a listing (`403` otherwise).

- `GET /api/v1/kyc` — own status, `null` if never submitted.
- Upload files first: `POST /api/v1/uploads` (multipart, `bucket: "kyc-documents"`, `folder?`) → `{ url }`.
- `POST /api/v1/kyc` — `{ idType, idDocUrl, selfieUrl }`. Sets `PENDING`, notifies every BACKEND user. Re-submitting overwrites the previous submission and clears rejection remarks.
- **Staff review** (not your call, but relevant): approve → `APPROVED`, seller notified "Your seller KYC has been verified. You can now publish listings." Reject → `REJECTED` with optional remarks.
- **Auto-approve**: there's an admin-configurable platform setting — if on, `POST /api/v1/kyc` skips the queue and is `APPROVED` immediately. Don't assume KYC always takes days — check the returned status.

---

## 3. Seller journey

### 3.1 Create a listing — `POST /api/v1/listings`
Requires role SELLER + `SellerKyc.status === "APPROVED"` (else `403 "KYC must be approved before creating a listing"`).

Core body: `{ title, description?, location, type: "RESIDENTIAL"|"PLOT"|"COMMERCIAL", areaSqft, bhk? (required unless PLOT), askingPrice, unitsAvailable? (default 1, positive whole number), photoUrls?: string[] }` plus optional "rich" fields (see the Property JSON shape in §11 for the full list — city, locality, pincode, carpetAreaSqft, bathrooms, balconies, furnishing, facing, floorNumber, totalFloors, ageYears, parking, possessionStatus, possessionDate, ownershipType, reraId, priceNegotiable, maintenanceMonthly, floorPlanUrl, videoUrl, amenities, builderName, projectName).

- **Photos**: upload each via `POST /api/v1/uploads` (`bucket: "property-media"`, up to 50MB each), collect URLs, send as `photoUrls` in order.
- Created with `status: "DRAFT"`. Every BACKEND user notified "New listing submitted: {title}."
- `201` with the full property object.

### 3.2 Backend reviews the listing (informational — staff-side)
Approve → `status: "LIVE"`, seller notified "Listing approved," now publicly searchable. Reject → `status: "REJECTED"`, seller notified "Listing rejected" (with remarks if given). **No self-serve resubmit-after-rejection flow exists** beyond editing (which doesn't change status) — flag to product if wanted.

### 3.3 Edit a listing — `PATCH /api/v1/properties/:id`
Seller-only, must own it. Any subset of the creation fields. **`photoUrls`, if included at all, fully replaces the existing photo set** in the given order — omit the field to leave photos untouched. Editing does **not** reset review status — a LIVE listing stays LIVE.

### 3.4 Delete a listing — `DELETE /api/v1/properties/:id`
Seller-only, must own it. **`409`** if a Deal already exists on it (can't delete mid-sale). Deletes photos from storage too.

### 3.5 Dual-role: also becoming a buyer — `POST /api/v1/auth/roles`
```
{ "role": "BUYER" }
```
Requires an existing BUYER/SELLER bearer token.

- Already holds that role → no-op, `200` with unchanged user.
- Otherwise → appends the role, returns updated user with both roles in `roles`. `userDTO.roles` is now the authoritative array (e.g. `["SELLER", "BUYER"]`); `role` stays the account's original/primary role for display only — **don't gate UI on `role` once `roles` has more than one entry.**
- `AGENT`/`BACKEND`/`ADMIN` are **not** self-addable here — those stay single, internally-provisioned roles.
- **There is currently no UI for this anywhere in the frontend.** If you want to expose "also start buying on this account," this is the one call needed — plus your local `User`/`AuthUser` type needs a `roles: string[]` field (currently would be silently dropped even if the backend sends it).
- **Once an account holds both roles**:
  - `GET /api/v1/offers?as=buyer` or `?as=seller` — which side to view. Defaults to buyer if omitted.
  - `GET /api/v1/site-visits?as=buyer` or `?as=seller` — same idea.
  - `GET /api/v1/deals` needs **no** `as` param — returns everything the account is a party to (buyer or seller), since a deal always has two distinct people.
  - Every action endpoint (accept/reject an offer, cancel a visit, upload a document) is authorized by **whether you're the specific buyer/seller on that record**, not global role — so those just work automatically for dual-role accounts.
- Demo accounts (password `password123`): `seller@demo.test` (dual-role — also holds BUYER), `buyer@demo.test`.

### 3.6 Requesting an Elite upgrade — `POST /api/v1/listings/:id/request-plan`
```
{ "plan": "ELITE" }
```
Seller-only, must own the property.

- Does **not** immediately change the plan. Sets `Property.requestedPlan = "ELITE"`, notifies staff (ADMIN + BACKEND) "Plan upgrade requested."
- Already on that plan → `400`. Already pending → `400 "This upgrade is already pending approval"`.
- **Staff-side**: approve → `plan` becomes `"ELITE"`, `requestedPlan` clears, seller notified "{title} is now on the ELITE plan." Decline → `requestedPlan` clears, plan unchanged, seller notified accordingly.
- **No payment collected anywhere in this flow yet** — deliberate, slots in at this request step later (charge first, then either keep staff-approval or set `plan` directly once payment is the gate).
- `propertyDTO` includes `requestedPlan` (`null` when nothing pending) — use for a "pending approval" badge.
- **No frontend UI exists today** — natural spot: a per-property action in the seller's "My Listings" view.

### 3.7 Offers and negotiation — see §5 (full shared contract).

### 3.8 Site visits on their property
Read-only: `GET /api/v1/site-visits` (`?as=seller` once dual-role) — who's coming, any post-visit feedback. Sellers cannot schedule, cancel, or set outcomes.

### 3.9 Deal progress — see §7.

---

## 4. Buyer journey

### 4.1 Browsing — `GET /api/v1/properties`
**No auth required.** Only returns `LIVE` properties — no client-side status filtering needed.

Query params:

| Param | Type | Notes |
|---|---|---|
| `q` | string | matches title, location, or exact city (normalized) |
| `type` | `RESIDENTIAL`\|`PLOT`\|`COMMERCIAL` | |
| `city` | string | normalized (`Bengaluru`→`Bangalore`, etc. — full list below) |
| `locality` | string | substring match, finer than `city` |
| `pincode` | string | exact match |
| `minPrice` / `maxPrice` | number | on `askingPrice` |
| `minBhk` | number | |
| `minBathrooms` | number | |
| `minArea` / `maxArea` | number | on `areaSqft` |
| `furnishing` | `UNFURNISHED`\|`SEMI_FURNISHED`\|`FULLY_FURNISHED` | |
| `facing` | `N`\|`S`\|`E`\|`W`\|`NE`\|`NW`\|`SE`\|`SW` | |
| `possessionStatus` | `READY_TO_MOVE`\|`UNDER_CONSTRUCTION` | |
| `maxAgeYears` | number | age in years, at most this old |
| `parking` | `true`/`1` | has covered or open parking |
| `ownershipType` | `FREEHOLD`\|`LEASEHOLD`\|`POWER_OF_ATTORNEY`\|`CO_OPERATIVE` | |
| `amenities` | comma-separated string | matches properties having **all** listed amenities |
| `eliteOnly` | `true`/`1` | `plan = ELITE` only |
| `ownerOnly` | `true`/`1` | excludes properties with an assigned agent — "owner listed only" filter |
| `sort` | `newest`\|`price_asc`\|`price_desc`\|`area_asc`\|`area_desc`\|`most_viewed` | default `newest` |

Invalid/unrecognized enum-like values are silently dropped rather than erroring.

**Canonical cities** (normalization target): `Bangalore, Mumbai, Delhi, Pune, Hyderabad, Chennai, Kolkata, Ahmedabad, Noida, Gurgaon, Jaipur, Chandigarh, Kochi, Coimbatore, Lucknow, Indore, Nagpur, Surat, Thane, Navi Mumbai`. Common alternates (`Bengaluru`, `Gurugram`, `Bombay`, `Cochin`, `Madras`, `Calcutta`, `New Delhi`, etc.) map automatically; anything else is stored/matched as typed.

### 4.2 Property detail — `GET /api/v1/properties/:id`
Auth optional (works logged out). Auto-records a view **unless** the viewer is the property's own seller/agent (dedup per-user per 30 minutes — don't call this yourself to "mark as viewed").

### 4.3 View analytics — `GET /api/v1/properties/:id/views`
Seller/agent (own listing) or ADMIN/BACKEND. `{ propertyId, viewCount, total, last7Days, uniqueViewers }`.

### 4.4 Recently viewed — `GET /api/v1/properties/recently-viewed`
BUYER only, `?pageSize=`. Deduped by property (viewed 5 times → shows once, at latest view time), most recent first, full property object + `viewedAt`.

### 4.5 Shortlisting
- `POST /api/v1/shortlists` `{ propertyId }` — idempotent (re-adding is a harmless `201` no-op).
- `GET /api/v1/shortlists` — paginated, full property objects each with `shortlistedAt`, newest first.
- `DELETE /api/v1/shortlists/:propertyId` — idempotent.

### 4.6 Saved searches & alerts
- `POST /api/v1/saved-searches` — `{ name?, filters, alertsEnabled? }`. `filters` mirrors the `GET /properties` query params exactly. `alertsEnabled` defaults `true`.
- `GET /api/v1/saved-searches` — own searches, newest first.
- `PATCH /api/v1/saved-searches/:id` — `{ name?, alertsEnabled? }`. Must own it (`404` otherwise, not `403` — doesn't reveal existence of another buyer's search).
- `DELETE /api/v1/saved-searches/:id` — idempotent, must own it.
- `POST /api/v1/saved-searches/run-alerts` — buyer-triggered "check now" scoped to own searches (returns `{ scanned, notified }`); new matches also arrive automatically as `Notification`s from a scheduled scan.

### 4.7 Making an offer — `POST /api/v1/offers`
```
{ "propertyId": "...", "amount": 4900000, "message": "Can close within 30 days" }
```
Buyer-only. Property must be `LIVE` — if `UNDER_CONTRACT` or otherwise unavailable, clean `400`, show it directly. Created `status: "PENDING_REVIEW"` — seller not yet notified. Buyer sees `displayStatus: "PENDING"`.

**Staff triage happens first, always** — a BACKEND user either forwards it to the seller (`status → PENDING`, seller now notified "New offer to review"), counters on the seller's behalf (`status → COUNTERED`, buyer notified), or rejects outright before the seller ever sees it (`status → REJECTED`, buyer notified). No offer reaches the seller without this step.

### 4.8 Responding, negotiating, and closing — see §5 for the complete contract (this replaced a simpler one-round model this session — read it even if you already know the old one).

### 4.9 Site visit outcome
Read-only for buyer — see §1, §6.

### 4.10 Deal progress once an offer is accepted — §7.

---

## 5. Offer negotiation — the complete state machine (updated this session — read carefully, contains a breaking change)

### 5.1 What changed
Negotiation used to allow **exactly one round**: buyer offers → backend triages → seller counters once → buyer can only accept or reject that single counter, nothing else, and no one could just end a stalled conversation. **This has been replaced** with unlimited back-and-forth negotiation plus a "close it" option for either side.

**If your current code calls the actions `acceptCounter` or `rejectCounter`, those calls will now fail** — the contract below is what you need to build/update against.

### 5.2 The state machine

```
Buyer creates offer
        │
        ▼
  PENDING_REVIEW  ──(backend rejects)──────────────────► REJECTED
        │
   (backend forwards)
        │
        ▼
     PENDING ─┬─(seller rejects)─────────────────────────► REJECTED
   (seller's  ├─(seller accepts)─────────────────────────► ACCEPTED → Deal created
    turn)     └─(seller counters)
                    │
                    ▼
               COUNTERED (counterBy: SELLER, buyer's turn) ─┬─(buyer rejects)──► REJECTED
                    │                                        ├─(buyer accepts)─► ACCEPTED → Deal created
                    └─(buyer counters back)
                              │
                              ▼
                         COUNTERED (counterBy: BUYER, seller's turn) ─── same three options, back to seller
                              │
                     ... repeats indefinitely, turn alternating every round, no limit ...

  At ANY point while PENDING or COUNTERED, from EITHER side (buyer, seller/agent,
  or backend/admin), regardless of whose turn it is:
        │
        ▼
  "close negotiation" ──► NEGOTIATION_CLOSED  (terminal — talks ended, no agreement, no Deal)
```

### 5.3 The API contract

**`PATCH /api/v1/offers/:id`** — `{ "action": "accept" | "reject" | "counter" | "close", "counterAmount"?: number }`

- Callable by SELLER, BUYER, or BACKEND (identity-checked per action, not just role-checked).
- **`accept` / `reject` / `counter`** are turn-based: only the party named in the offer's `turn` field can call them right now.
  - Acting out of turn → `403 "It's not your turn — waiting on the other party."`
  - Acting when the negotiation isn't `PENDING`/`COUNTERED` (already accepted/rejected/closed) → `400 "This negotiation is no longer active"`.
  - Backend cannot use `accept`/`reject`/`counter` mid-negotiation (only pre-forward triage, via `/negotiations`) — backend calling these gets `403 "Only the buyer or seller can respond mid-negotiation — use close to end it instead."`
- **`accept`** always accepts `currentAmount` (whatever's currently on the table — see the DTO fields below). Creates a Deal — see §5.5.
- **`counter`** requires `counterAmount` (positive number). Sets `status: "COUNTERED"`, flips `counterBy` to whoever just acted, hands the turn to the other side. No limit on how many times this repeats.
- **`reject`** ends the negotiation as `REJECTED`, notifies the other party.
- **`close`** — **no turn restriction**, callable by buyer, seller/agent, **or backend/admin**, any time the offer is still `PENDING`/`COUNTERED`. Sets `status: "NEGOTIATION_CLOSED"`, notifies whichever parties didn't initiate the close ("The negotiation on {title} was closed without an agreement.").

**Whose turn is it? Read it off the offer object — don't recompute it client-side.** Every offer DTO now includes:
- `"turn"`: `"BUYER"` | `"SELLER"` | `null` (null once the negotiation is no longer active). `status: "PENDING"` → always `"SELLER"`. `status: "COUNTERED"` → whoever's turn it is next (opposite of `counterBy`).
- `"currentAmount"`: the number currently on the table — `amount` if never countered, else the latest `counterAmount`. Use this for button copy ("Accept ₹{currentAmount}") instead of picking between `amount`/`counterAmount` yourself.

### 5.4 Negotiation timeline — `GET /api/v1/offers/:id`
Returns the offer plus a full `events[]` array, oldest first:
```json
{ "id": "...", "type": "COUNTERED_SELLER", "amount": 5300000, "actorRole": "SELLER", "note": null, "createdAt": "..." }
```
`type` is one of `CREATED`, `FORWARDED`, `COUNTERED_BACKEND`, `COUNTERED_SELLER`, `COUNTERED_BUYER` (new — logged when the buyer counters back), `ACCEPTED`, `REJECTED`, `COUNTER_ACCEPTED`, `COUNTER_REJECTED`, `CLOSED` (new). `actorRole` is `BUYER`, `SELLER`, or `BACKEND` — backend-triage events (`FORWARDED`, `COUNTERED_BACKEND`) genuinely appear here (not hidden from the timeline the way backend's involvement is hidden from buyer-facing notification copy). Build **one shared timeline component** for both buyer and seller views — same event shape both sides.

A seller gets `404` (not `403`) calling this on an offer still `PENDING_REVIEW` — same "don't reveal it exists yet" behavior as the list endpoint.

**`GET /api/v1/offers`** (the list) does **not** include `events` — fetch the single-offer endpoint when a user opens one offer's detail/timeline view, to keep the list light. Seller's list excludes `PENDING_REVIEW` offers automatically. Buyer's list includes `displayStatus`.

### 5.5 What happens the moment ANY offer is accepted (any round)
1. That offer → `ACCEPTED`.
2. A `Deal` is created: buyer, seller, `agreedPrice` = whatever `currentAmount` was at the moment of acceptance, `status: "IN_PROGRESS"`.
3. The property → `UNDER_CONTRACT` (out of search, no new offers accepted).
4. **Every other non-terminal offer on the same property** (`PENDING_REVIEW`, `PENDING`, or `COUNTERED`) auto-flips to `REJECTED` — if three buyers had offers pending and one gets accepted, the other two silently become `REJECTED` (no distinct "someone else bought it" notification exists — flag to product if you want explicit copy for this).
5. **Race-safety**: if two offers on the same property get accepted in the same instant, exactly one wins and the loser gets a clean `409 "This property already has a deal in progress."` — no crash, no partial state. Treat this 409 as non-transient — refresh state, don't retry.

### 5.6 Backend triage endpoints (context only — you don't call these)
- `GET /api/v1/negotiations` (BACKEND) — offers awaiting triage (`PENDING_REVIEW`).
- `PATCH /api/v1/negotiations/:id` (BACKEND) — `{ action: "forward" | "counter" | "reject", counterAmount? }`. `forward` → seller now sees it; `counter` → backend counters on seller's behalf, buyer notified with copy identical to a seller-issued counter (backend's involvement is never surfaced to the buyer here — but note it *does* appear in `events[]`, see §5.4); `reject` → buyer notified, seller never sees it.

### 5.7 Testing note
This whole flow was tested live this session with a real 3-round negotiation (offer → seller counters → buyer counters back → seller counters again → buyer accepts), confirming turn enforcement at each step, correct `currentAmount`/`turn`, and that the final Deal's `agreedPrice` matches the last round's number — plus confirmed buyer, seller, and backend can each independently close a negotiation.

---

## 6. Site visit lifecycle in full

```
Buyer requests visit (POST /api/v1/site-visits)
        │
        ▼
    REQUESTED  ──(buyer cancels)─────────────────────────► CANCELLED
        │
  (staff assigns an agent — internal dashboard only)
        │
  (agent schedules — internal dashboard only, sets a date)
        │
        ▼
    SCHEDULED  ──(buyer OR agent cancels)────────────────► CANCELLED
        │
  (agent marks complete — internal dashboard only, optional feedback)
        │
        ▼
    COMPLETED
        │
  (agent records outcome — internal dashboard only)
        │
        ├── INTERESTED (+ amount) → agent can convert straight to a Deal
        └── NOT_INTERESTED → dead end, no reschedule path exists today
```

- `POST /api/v1/site-visits` — `{ propertyId, requestedDate, buyerNote? }`. Buyer-only. Auto-assigns the property's existing agent if one is set. `403` if site visits are platform-disabled. Only staff get notified of a new request (to assign an agent) — the seller isn't notified directly here.
- `GET /api/v1/site-visits` — `?status=` filter. BUYER sees own requests, AGENT sees visits assigned to them, SELLER (once supported on your side) sees read-only visits on their own properties. Once dual-role, use `?as=buyer|seller`.
- `PATCH /api/v1/site-visits/:id` `{ action: "cancel" }` — buyer (own visit) or the assigned agent, only while `REQUESTED`/`SCHEDULED`. Already `COMPLETED`/`CANCELLED` → `400`.
- **Everything else** (assign agent, schedule with a date, mark complete with feedback, record outcome, convert to deal) is **internal-dashboard-only** — no public API for a buyer to do any of these; the agent drives the visit in person and updates it from their own dashboard afterward.
- **If NOT_INTERESTED, there is no "reopen" path** — a fresh `POST /api/v1/site-visits` is the only way to request another visit on the same property.
- Converting a completed, INTERESTED visit straight into a Deal **skips §5's entire offer/negotiation flow** — this is the "we already agreed on price in person during the visit" path, since negotiation for this business happens face-to-face, not online.

---

## 7. Deal lifecycle (payments, documents, closing)

A Deal exists once an offer is accepted (§5) or a site visit converts directly (§6).

### 7.1 Viewing deals
- `GET /api/v1/deals` — role-scoped: buyer sees own as buyer, seller sees own as seller (dual-role account sees the union, no `as` param needed).
- `GET /api/v1/deals/:id` — single deal detail. Accessible to that deal's buyer, seller, agent, or ADMIN — `403` for anyone else.

### 7.2 Payments (staff-recorded, buyer/seller read-only)
Token and final payment (`tokenAmount`/`tokenDate`, `finalAmount`/`finalPaymentDate`, `paymentMode`, `transactionRef`) are recorded by staff from the internal dashboard. Treat these as read-only fields on the deal object.

### 7.3 Document checklist — biggest gap, needs building
Staff request specific documents (e.g. "Sale deed", "NOC", "Encumbrance certificate") against a deal — **you need to build the UI for the buyer/seller to see and fulfill these**, it doesn't exist today.

- `GET /api/v1/deals/:id/documents` — `[{ id, dealId, docType, requiredFrom: "BUYER"|"SELLER"|"EITHER", fileUrl, status, remarks, uploadedBy, createdAt, updatedAt }]`.
- **Adding a requirement** (`POST /api/v1/deals/:id/documents { docType, requiredFrom }`) is staff-only — not your call, but you'll see the result appear here.
- **Uploading** (only the party `requiredFrom` names, or either if `EITHER`): upload the actual file via `POST /api/v1/uploads` (`bucket: "deal-documents"`) → get `fileUrl` → `PATCH /api/v1/deals/:id/documents/:docId { fileUrl }`. Sets status `→ UPLOADED`, notifies the assigned agent. **This endpoint does not accept the file itself** — upload first, then PATCH the URL.
- **Review** (staff/agent only — `403` for buyer/seller): `PATCH .../:docId { status: "APPROVED" | "REJECTED", remarks? }`. Notifies whoever actually uploaded it.
- **Deal closure is blocked** (`POST /api/v1/deals/:id/close` → `400`) while any document isn't `APPROVED` — same rule enforced on both the API and the internal dashboard, no way around it. **If staff request a document and there's no UI for the buyer/seller to upload it, the deal literally cannot close.** This is a live gap, not a future one — build this section as the top priority.

### 7.4 Progress log (internal-only)
Staff post free-text updates to a running log on the deal. **No public API endpoint exposes this** — internal-dashboard-only. Flag to backend if you want buyer/seller visibility into this.

### 7.5 Closing
Staff-only action. Sets `Deal.status: "CLOSED"` and property to `Property.status: "CLOSED"`, computes commission, notifies both buyer and seller "Deal closed." No buyer/seller-facing action triggers this — reflect it once it happens (poll/refetch, or wait for the "Deal closed" notification).

---

## 8. Amenities master list (used to populate listing forms)

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/amenities` | any | `?all=1` (ADMIN only) includes inactive | active amenity list — use to populate a listing form's amenities checklist |

Only GET is relevant to your app — creating/editing/deleting amenities is ADMIN-only (internal dashboard).

## 9. Uploads

Uploads are always a separate step from creating a resource — upload first, get a URL back, then send that URL in the JSON body of the actual create/submit call.

```
POST /api/v1/uploads
Content-Type: multipart/form-data
  file: <binary>
  bucket: "property-media" | "kyc-documents" | "deal-documents"
  folder: <optional string, defaults to your user id>

→ 200 { "data": { "url": "https://...supabase.co/storage/..." } }
```
- `property-media` — public bucket, listing photos/videos, up to 50MB each.
- `kyc-documents` — private bucket (ID docs/selfies); returned URL is a long-lived signed URL.
- `deal-documents` — private bucket, for deal-document sharing (§7.3).

## 10. Insights

`GET /api/v1/insights/locality-price?city=Bangalore&locality=Whitefield` (any auth) → `{ city, locality, sampleSize, avgPrice, avgPricePerSqft }`, computed live from `LIVE` listings only. **This is a current snapshot, not a trend** — there's no price-history model in the schema, so no "up/down N% vs last quarter" is possible. `sampleSize: 0` gives `null` for both averages.

## 11. Notifications

- `GET /api/v1/notifications` — paginated, includes `unreadCount` alongside pagination fields.
- `POST /api/v1/notifications/:id/read` — mark one read.
- `POST /api/v1/notifications/read-all` — mark all read.

Shape: `{ "id": "...", "title": "Offer countered", "message": "...", "isRead": false, "createdAt": "..." }`. Saved-search matches and site-visit status changes arrive here too — no separate feed to poll.

**Full map of what triggers what, grouped by recipient:**

**To the buyer:**
- "Offer accepted" — their offer (any round) accepted.
- "Deal started" — same moment, second notification about the new deal.
- "Offer rejected" — seller/backend rejected, any round.
- "Offer countered" — seller or backend countered, any round.
- "Negotiation closed" — ended without agreement by the seller or staff (only if they weren't the one who closed it).
- "Document approved" / "Document rejected" — their upload was reviewed.
- "Deal closed".
- "Site visit scheduled" / "Site visit completed" / "Site visit cancelled".
- Outcome-related notification after the agent records visit outcome.

**To the seller:**
- "New offer to review" — backend forwarded a buyer's offer.
- "Deal started" — their property's offer accepted.
- "Offer countered" — buyer countered back, any round (new — previously only the buyer could ever receive a counter notification).
- "Offer rejected" — buyer rejected the current counter, any round.
- "Negotiation closed" — ended by the buyer or staff (only if they weren't the one who closed it).
- "Listing approved" / "Listing rejected".
- "KYC approved" / "KYC rejected".
- "Listing plan updated" (staff directly changed plan) / "Plan upgrade approved" / "Plan upgrade declined" (their Elite request reviewed).
- "Document required" / "Document approved" / "Document rejected".
- "Deal closed".

---

## 12. JSON object shapes

Exact objects returned inside `data`/`data.items`. All timestamps ISO-8601 strings; money fields plain numbers in INR; nullable fields shown `| null`.

### User
```json
{
  "id": "cmk…", "name": "Priya Nair", "email": "buyer@demo.test",
  "phone": "+91 98765 43210", "role": "BUYER", "roles": ["BUYER"],
  "isActive": true,
  "createdAt": "2026-07-01T10:00:00.000Z", "updatedAt": "2026-07-01T10:00:00.000Z"
}
```
`role`: `SELLER | BUYER | AGENT | BACKEND | ADMIN`. `roles`: array, authoritative once it has more than one entry (§3.5). `phone` may be `null`.

### Property
```json
{
  "id": "cmk…", "sellerId": "cmk…", "agentId": null,
  "type": "RESIDENTIAL", "title": "Whitefield 4BHK Villa",
  "description": "Spacious villa with…", "location": "Whitefield, Bangalore",
  "latitude": 12.9698, "longitude": 77.7499,
  "areaSqft": 2400, "bhk": 4, "askingPrice": 55000000,
  "status": "LIVE", "plan": "BASIC", "requestedPlan": null, "viewCount": 214,

  "city": "Bangalore", "locality": "Whitefield", "pincode": "560066",
  "carpetAreaSqft": 2100, "builtUpAreaSqft": 2300, "superBuiltUpAreaSqft": 2400,

  "bathrooms": 4, "balconies": 2, "furnishing": "SEMI_FURNISHED", "facing": "NE",
  "floorNumber": 3, "totalFloors": 4, "ageYears": 2, "parkingCovered": 2, "parkingOpen": 1,

  "possessionStatus": "READY_TO_MOVE", "possessionDate": null,
  "ownershipType": "FREEHOLD", "reraId": "PRM/KA/RERA/…",
  "priceNegotiable": true, "maintenanceMonthly": 4500,

  "floorPlanUrl": null, "videoUrl": null,
  "amenities": ["Lift", "24x7 Security", "Clubhouse"],

  "builderName": "Prestige Group", "projectName": "Prestige Lakeside Habitat",

  "verifiedAt": "2026-07-10T08:30:00.000Z",
  "createdAt": "2026-07-05T08:30:00.000Z", "updatedAt": "2026-07-10T08:30:00.000Z",
  "sellerName": "Rohan Mehta", "agentName": null,
  "photos": [ { "id": "cmk…", "url": "https://…supabase.co/storage/v1/object/public/property-media/…", "order": 0 } ]
}
```
- `type`: `RESIDENTIAL | PLOT | COMMERCIAL` · `status`: `DRAFT | PENDING_VERIFICATION | LIVE | UNDER_CONTRACT | REJECTED | CLOSED` · `plan`: `BASIC | ELITE` · `requestedPlan`: `null | "ELITE"`.
- `bhk`, `latitude`, `longitude`, `verifiedAt`, `agentId`, `requestedPlan` may be `null` (`bhk` null for plots/commercial).
- `photos[].url` is a public URL, directly usable in `<img src>`. Ordered by `order` ascending — `photos[0]` is the cover image.
- All fields between `viewCount` and `builderName`/`projectName` are optional/nullable — added for richer detail pages, may be `null` on older listings.
- `furnishing`: `UNFURNISHED | SEMI_FURNISHED | FULLY_FURNISHED` · `facing`: `N|S|E|W|NE|NW|SE|SW` · `possessionStatus`: `READY_TO_MOVE|UNDER_CONSTRUCTION` · `ownershipType`: `FREEHOLD|LEASEHOLD|POWER_OF_ATTORNEY|CO_OPERATIVE`.
- `amenities` is a plain string array, not a foreign-key relation.
- `viewCount` auto-increments on `GET /properties/:id` from anyone but the owner/agent, deduped per-user per 30 min — don't increment it yourself.

### Offer
```json
{
  "id": "cmk…", "propertyId": "cmk…", "buyerId": "cmk…",
  "amount": 52500000, "message": "Can close within 30 days",
  "status": "COUNTERED", "displayStatus": "COUNTERED",
  "counterAmount": 54000000, "counterBy": "SELLER",
  "currentAmount": 54000000, "turn": "BUYER",
  "reviewedBy": "cmk…",
  "createdAt": "…", "updatedAt": "…",
  "propertyTitle": "Whitefield 4BHK Villa", "propertyLocation": "Whitefield, Bengaluru",
  "buyerName": "Aisha Khan"
}
```
- `status`: `PENDING_REVIEW | PENDING | ACCEPTED | REJECTED | COUNTERED | NEGOTIATION_CLOSED`.
- Render `displayStatus` for buyers (collapses `PENDING_REVIEW`→`PENDING`).
- `message`, `counterAmount`, `counterBy`, `reviewedBy` may be `null`. `turn` is `null` once the negotiation is no longer active.
- `currentAmount`/`turn` are new this session — see §5.3 for how to use them. Negotiation is unlimited-round, not single-shot.

### Deal
```json
{
  "id": "cmk…", "propertyId": "cmk…", "buyerId": "cmk…", "sellerId": "cmk…", "agentId": "cmk…",
  "agreedPrice": 54000000,
  "tokenAmount": 500000, "tokenDate": "2026-07-12T00:00:00.000Z",
  "finalAmount": 53500000, "finalPaymentDate": "2026-07-18T00:00:00.000Z",
  "paymentMode": "BANK_TRANSFER", "transactionRef": "UTR12345",
  "notes": "Registration on 20th", "status": "CLOSED",
  "createdAt": "…", "updatedAt": "…",
  "propertyTitle": "…", "propertyLocation": "…",
  "buyerName": "…", "sellerName": "…", "agentName": "…"
}
```
`status`: `IN_PROGRESS | CLOSED`. Created `IN_PROGRESS` (`agentId: null` until assigned by admin). `agentId`, token/final payment fields, `paymentMode`, `transactionRef`, `notes` are `null` until recorded.

### Deal Document
```json
{
  "id": "cmk…", "dealId": "cmk…", "docType": "Sale Deed",
  "requiredFrom": "SELLER", "fileUrl": null, "status": "PENDING",
  "remarks": null, "uploadedBy": null,
  "createdAt": "…", "updatedAt": "…"
}
```
`requiredFrom`: `BUYER | SELLER | EITHER`. `status`: `PENDING | UPLOADED | APPROVED | REJECTED`.

### KYC submission
```json
{
  "id": "cmk…", "userId": "cmk…", "idType": "AADHAAR",
  "idDocUrl": "https://…signed-url…", "selfieUrl": "https://…signed-url…",
  "status": "PENDING", "remarks": null,
  "createdAt": "…", "updatedAt": "…"
}
```
`status`: `PENDING | APPROVED | REJECTED`. `remarks` carries the rejection reason. Document URLs are long-lived signed URLs (private bucket).

### Notification
```json
{ "id": "cmk…", "title": "Offer countered", "message": "…", "isRead": false, "createdAt": "…" }
```

### Saved search
```json
{
  "id": "cmk…", "name": "3BHK Whitefield under 1.5Cr",
  "filters": { "q": "whitefield", "type": "RESIDENTIAL", "minBhk": 3, "maxPrice": 15000000 },
  "alertsEnabled": true, "lastAlertedAt": "2026-07-15T09:00:00.000Z",
  "createdAt": "…"
}
```
`filters` keys mirror the full `GET /properties` query param set — reuse the same object for both the saved search and the live search request.

### Site visit
```json
{
  "id": "cmk…", "propertyId": "cmk…", "buyerId": "cmk…", "agentId": "cmk…",
  "status": "SCHEDULED", "requestedDate": "2026-07-20T10:00:00.000Z",
  "scheduledDate": "2026-07-21T15:30:00.000Z", "buyerNote": "Prefer evening",
  "feedback": null, "createdAt": "…", "updatedAt": "…",
  "propertyTitle": "Whitefield 4BHK Villa", "propertyLocation": "Whitefield, Bengaluru"
}
```
`status`: `REQUESTED | SCHEDULED | COMPLETED | CANCELLED`. `agentId` is `null` until the property has (or gets) an assigned agent. `outcome` (`INTERESTED`/`NOT_INTERESTED`/`null`) also exists on this model but is agent-set, read-only to buyer/seller.

---

## 13. End-to-end flows, quick reference

**Seller lists a property (with photos)**: `POST /uploads` per photo (`bucket: "property-media"`) → collect URLs → `POST /listings` with `{ title, description, location, type, areaSqft, bhk, askingPrice, photoUrls: [...] }` + any rich fields → requires KYC `APPROVED` → starts `DRAFT` → backend reviews via `/queue` → `LIVE` or `REJECTED`.

**Seller KYC**: `POST /uploads` (`bucket: "kyc-documents"`) for ID doc + selfie → `POST /kyc` `{ idType, idDocUrl, selfieUrl }` → poll `GET /kyc` for `APPROVED`.

**Buyer makes an offer and negotiates**: browse `GET /properties` → `POST /offers { propertyId, amount, message? }` → track in `GET /offers` (watch `displayStatus`, `turn`, `currentAmount`) → whenever `turn === "BUYER"`, respond via `PATCH /offers/:id { action: "accept" | "reject" | "counter", counterAmount? }` — repeat as many rounds as needed → either side can `{ action: "close" }` at any point to end it without a deal → acceptance creates a Deal visible in `GET /deals`.

**Buyer shortlists a property**: `POST /shortlists { propertyId }` (heart icon) → `GET /shortlists` for "Saved properties" → `DELETE /shortlists/:propertyId` to unsave. Idempotent, safe to call repeatedly.

**Buyer saves a search + gets alerted**: after filtering `GET /properties`, `POST /saved-searches { name, filters }` with the same filter object → new matching `LIVE` listings arrive as `Notification`s automatically; force a check with `POST /saved-searches/run-alerts`.

**Buyer requests a site visit**: `POST /site-visits { propertyId, requestedDate, buyerNote? }` → poll `GET /site-visits` for status (`REQUESTED → SCHEDULED → COMPLETED`, or `CANCELLED`) → `PATCH /site-visits/:id { action: "cancel" }` to back out.

**Seller requests an Elite upgrade**: `POST /listings/:id/request-plan { plan: "ELITE" }` → poll `GET /listings` or the single property for `requestedPlan` clearing (approved → `plan: "ELITE"`; declined → `requestedPlan: null`, `plan` unchanged).

**Deal document upload** (needs building — see §7.3): `GET /deals/:id/documents` → for each `PENDING`/`REJECTED` item where you're the `requiredFrom` party, `POST /uploads` (`bucket: "deal-documents"`) → `PATCH /deals/:id/documents/:docId { fileUrl }` → poll for `APPROVED`/`REJECTED`.

**Dual-role: seller also becomes a buyer** (needs building — see §3.5): `POST /auth/roles { role: "BUYER" }` → now use `GET /offers?as=buyer` / `GET /offers?as=seller` (and same for site-visits) to switch views.

---

## 14. Error handling checklist

| Status | Meaning | What to show |
|---|---|---|
| 400 | Validation failed, or action not valid in current state (e.g. countering an already-accepted offer, acting when negotiation isn't active) | The `error.message` directly — written to be user-facing |
| 401 | Missing/invalid/expired token, or account deactivated | Force re-login |
| 403 | Wrong role, not the resource's actual owner/party, or (new) acting out of turn in a negotiation | Show the message directly — e.g. "It's not your turn — waiting on the other party" is meant to be read by the user |
| 404 | Not found — or, for a seller viewing an offer still `PENDING_REVIEW`, deliberately reported as 404 rather than 403 (shouldn't be able to distinguish "doesn't exist" from "not forwarded yet") | Standard not-found handling |
| 409 | Conflict — property no longer available, deal already exists, duplicate plan request, etc. | Refresh state, don't retry — not transient |

---

## 15. Summary checklist — what's new, what needs building, in priority order

1. **Deal documents UI (§7.3)** — doesn't exist, highest priority, actively blocks deal closing today.
2. **Multi-round negotiation (§5)** — **breaking change** on an endpoint you already call. Old `acceptCounter`/`rejectCounter` action names are gone, replaced by shared `accept`/`reject`/`counter` disambiguated by the new `turn` field; a buyer can now counter back (new button needed); any party can `close` a negotiation (new button, new terminal status `NEGOTIATION_CLOSED` to handle). **Update this before shipping anything that calls `PATCH /offers/:id`.**
3. **`UNDER_CONTRACT` property status (§1, §5.5)** — add to your `PropertyStatus` type, give it a real badge/label instead of raw text.
4. **Elite plan request (§3.6)** — no UI; needs a per-property action + pending-state badge.
5. **Dual-role accounts (§3.5)** — no `roles` field in your user type, no way to add a second role, and your two-shell architecture (separate buyer/seller login routes/dashboards) would need real work to let one account use both sides. Backlog, not urgent.
6. Everything else in this document (auth, Google sign-in, browse, shortlist, saved searches, site visits, KYC) — confirmed already working correctly against the current backend contract as of this session.
