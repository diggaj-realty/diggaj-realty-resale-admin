# Resale Platform API (v1)

Base URL:
- Local: `http://localhost:3000/api/v1`
- **Production: `https://diggaj-realty-resale-admin.vercel.app/api/v1`** (live, backed by the real Supabase DB)

CORS is open (`Access-Control-Allow-Origin: *`) so this can be called from any origin/port.

## Auth

Token-based, not cookies. Register or log in once, then send the token on every other request.

```
POST /api/v1/auth/register
Content-Type: application/json
{ "name": "Aisha Khan", "email": "aisha@example.com", "password": "at-least-8-chars", "phone": "9876543210", "role": "BUYER" }

→ 201 { "data": { "token": "<jwt>", "user": { id, name, email, phone, role, isActive, createdAt, updatedAt } } }
```
- `role` must be `"BUYER"` or `"SELLER"` (case-insensitive) — public self-serve signup only creates these two roles. `AGENT`/`BACKEND`/`ADMIN` accounts are provisioned internally, not through this endpoint.
- `phone` is optional; `name`, `email`, `password` (min 8 chars) are required.
- `409` if the email is already registered, `400` for validation errors.
- Response shape matches login — the frontend can log the user straight in with the returned token, no second request needed.

```
POST /api/v1/auth/login
Content-Type: application/json
{ "email": "buyer@demo.test", "password": "password123" }

→ 200 { "data": { "token": "<jwt>", "user": { id, name, email, phone, role, isActive, createdAt, updatedAt } } }
```

**This public API only issues tokens to `BUYER`/`SELLER` accounts.** `AGENT`,
`BACKEND`, and `ADMIN` credentials get a `403` here — those roles sign in
exclusively through the internal dashboard's own `/login` page (a separate,
cookie-based session, not part of this API). This is intentional: internal
staff credentials are never usable from the public-facing surface.

Send the token on every subsequent request:
```
Authorization: Bearer <jwt>
```
Tokens are valid 30 days. `GET /api/v1/auth/me` returns the current user (validates the token and that the account is still active).

Demo accounts (password `password123` for all, public-API-usable): `seller@demo.test`, `buyer@demo.test`.

## Response envelope

Success: `{ "data": ... }` — 2xx.
Error: `{ "error": { "message": "..." } }` — 4xx/5xx. Common statuses: 400 validation, 401 missing/invalid token, 403 wrong role or not the resource owner, 404 not found.

Paginated lists return:
```
{ "data": { "items": [...], "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
```
Control with `?page=` and `?pageSize=` query params (`pageSize` capped at 100).

## File uploads

Uploads are a separate step from creating a resource — upload the file first, get back a URL, then send that URL in the JSON body of the resource create/submit call.

```
POST /api/v1/uploads
Content-Type: multipart/form-data
  file: <binary>
  bucket: "property-media" | "kyc-documents" | "deal-documents"
  folder: <optional string, defaults to your user id>

→ 200 { "data": { "url": "https://...supabase.co/storage/..." } }
```
- `property-media` — public bucket, use for listing photos/videos (up to 50MB each).
- `kyc-documents` — private bucket (ID docs/selfies); returned URL is a long-lived signed URL.
- `deal-documents` — private bucket, reserved for future deal-document sharing.

## Roles

`SELLER` · `BUYER` · `AGENT` · `BACKEND` · `ADMIN` — each endpoint below lists which role(s) may call it.

## Endpoints

### Profile & dashboard
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/auth/me` | any | — | current user |
| PATCH | `/profile` | any | `{ name, phone }` | |
| POST | `/profile/password` | any | `{ currentPassword, newPassword }` | min 8 chars |
| GET | `/dashboard` | any | — | role-appropriate stats/pipeline (same data as the internal dashboard + performance page) |

### KYC
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/kyc` | SELLER | — | own status, `null` if never submitted |
| POST | `/kyc` | SELLER | `{ idType, idDocUrl, selfieUrl }` | upload files first via `/uploads` |
| GET | `/kyc/queue` | BACKEND | — paginated | pending submissions, oldest first |
| POST | `/kyc/:id/review` | BACKEND | `{ decision: "APPROVED" \| "REJECTED" }` | |

### Listings & browsing
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/properties` | any | — paginated, `?q=` search, `?type=` filter | LIVE properties only (buyer browse); recording a view (see below) happens automatically on `GET /properties/:id` |
| GET | `/properties/:id` | any | — | single property + photos; auto-records a `PropertyView` for the requesting user unless they're the listing's own seller/agent |
| GET | `/properties/:id/views` | seller/agent (own listing) or ADMIN/BACKEND | — | `{ propertyId, viewCount, total, last7Days, uniqueViewers }` — view analytics, not for buyers |
| GET | `/listings` | SELLER/AGENT/ADMIN/BACKEND | — paginated | role-scoped: seller sees own, agent sees assigned, admin/backend see all |
| POST | `/listings` | SELLER | `{ title, description, location, type, areaSqft, bhk, askingPrice, photoUrls[], ...richFields? }` | requires approved KYC; `type` one of `RESIDENTIAL/PLOT/COMMERCIAL`; starts as `DRAFT`; `richFields` are all optional — see "Rich listing fields" below |
| GET | `/queue` | BACKEND | — paginated | listings awaiting verification (`DRAFT`/`PENDING_VERIFICATION`) |
| POST | `/queue/:id/review` | BACKEND | `{ decision: "LIVE" \| "REJECTED" }` | |

### Amenities master list
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/amenities` | any | — `?all=1` (ADMIN only) includes inactive | active amenity list, use to populate a listing form's amenities checklist |
| POST | `/amenities` | ADMIN | `{ name, category? }` | `409` if name already exists |
| PATCH | `/amenities/:id` | ADMIN | `{ name?, category?, active? }` | |
| DELETE | `/amenities/:id` | ADMIN | — | idempotent; existing properties keep their recorded `amenities` strings even after one is deleted from the master list |

### Shortlists (buyer favorites)
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/shortlists` | BUYER | — paginated | full `Property` objects (each with a `shortlistedAt` timestamp), newest first |
| POST | `/shortlists` | BUYER | `{ propertyId }` | idempotent — re-adding an already-shortlisted property is a no-op, `201` either way |
| DELETE | `/shortlists/:propertyId` | BUYER | — | idempotent — `200` even if it wasn't shortlisted |

### Saved searches & alerts
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/saved-searches` | BUYER | — | own saved searches, newest first |
| POST | `/saved-searches` | BUYER | `{ name?, filters, alertsEnabled? }` | `filters` shape: `{ q?, type?, minPrice?, maxPrice?, minBhk?, city? }` (same params as `GET /properties`); `alertsEnabled` defaults `true` |
| PATCH | `/saved-searches/:id` | BUYER (owner) | `{ name?, alertsEnabled? }` | |
| DELETE | `/saved-searches/:id` | BUYER (owner) | — | idempotent |
| POST | `/saved-searches/run-alerts` | BUYER/ADMIN/BACKEND | — | BUYER: scans only their own searches ("check now"); ADMIN/BACKEND: platform-wide scan (intended for a scheduled cron); returns `{ scanned, notified }`; new matches arrive as in-app `Notification`s |

### Site visits
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/site-visits` | BUYER/AGENT | — paginated, `?status=` filter | BUYER sees own requests, AGENT sees visits assigned to them |
| POST | `/site-visits` | BUYER | `{ propertyId, requestedDate, buyerNote? }` | auto-assigns the property's existing agent if one is set; `403` if site visits are platform-disabled |
| PATCH | `/site-visits/:id` | BUYER/AGENT | `{ action: "schedule" \| "complete" \| "cancel", scheduledDate?, feedback? }` | `schedule`/`complete` are agent-only (and claim the visit as theirs); `cancel` works for either owning party; each transition notifies the counterparty |

### Offers & negotiations
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/offers` | SELLER/BUYER | — paginated | seller: forwarded offers only; buyer: own offers with `displayStatus` collapsing PENDING_REVIEW→PENDING |
| POST | `/offers` | BUYER | `{ propertyId, amount, message? }` | always starts `PENDING_REVIEW` — seller never sees it directly |
| PATCH | `/offers/:id` | SELLER/BUYER | `{ action, counterAmount? }` | seller actions: `accept`,`reject`,`counter`; buyer actions: `acceptCounter`,`rejectCounter`; `accept`/`acceptCounter` auto-creates a Deal |
| GET | `/negotiations` | BACKEND | — paginated | offers awaiting triage (`PENDING_REVIEW`) |
| PATCH | `/negotiations/:id` | BACKEND | `{ action, counterAmount? }` | `action`: `forward` (→ seller), `counter`, or `reject` |

### Deals
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/deals` | SELLER/BUYER/AGENT/ADMIN | — paginated | role-scoped; admin sees all |
| GET | `/deals/:id` | participant or ADMIN | — | 403 if not a participant |
| POST | `/deals/:id/token-payment` | AGENT (assigned) | `{ tokenAmount, tokenDate }` | |
| POST | `/deals/:id/final-payment` | AGENT (assigned) | `{ finalAmount, finalPaymentDate, paymentMode, transactionRef? }` | `paymentMode`: `BANK_TRANSFER/CHEQUE/OTHER` |
| POST | `/deals/:id/notes` | AGENT (assigned) | `{ notes }` | |
| POST | `/deals/:id/close` | AGENT (assigned) | — | requires final payment recorded first |
| POST | `/deals/:id/assign-agent` | ADMIN | `{ agentId }` | |

### Users & notifications
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/users` | ADMIN | — paginated, `?role=` filter | |
| POST | `/users/:id/toggle-active` | ADMIN | `{ isActive }` | |
| GET | `/notifications` | any | — paginated | includes `unreadCount` |
| POST | `/notifications/:id/read` | any (owner) | — | |
| POST | `/notifications/read-all` | any | — | |

## JSON object shapes

Exact objects as returned inside `data` / `data.items`. All timestamps are ISO-8601 strings; money fields are plain numbers in INR; nullable fields are shown with `| null`. Relation conveniences (`sellerName`, `propertyTitle`, …) are present when the endpoint includes them and may be `undefined` otherwise.

### User
```json
{
  "id": "cmk…", "name": "Priya Nair", "email": "admin@demo.test",
  "phone": "+91 98765 43210" , "role": "ADMIN",
  "isActive": true,
  "createdAt": "2026-07-01T10:00:00.000Z", "updatedAt": "2026-07-01T10:00:00.000Z"
}
```
`role`: `SELLER | BUYER | AGENT | BACKEND | ADMIN`. `phone` may be `null`.

### Property (listings, browse, single view)
```json
{
  "id": "cmk…", "sellerId": "cmk…", "agentId": null,
  "type": "RESIDENTIAL", "title": "Whitefield 4BHK Villa",
  "description": "Spacious villa with…", "location": "Whitefield, Bengaluru",
  "latitude": 12.9698, "longitude": 77.7499,
  "areaSqft": 2400, "bhk": 4, "askingPrice": 55000000,
  "status": "LIVE", "plan": "BASIC", "viewCount": 214,

  "city": "Bengaluru", "locality": "Whitefield", "pincode": "560066",
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
- `type`: `RESIDENTIAL | PLOT | COMMERCIAL` · `status`: `DRAFT | PENDING_VERIFICATION | LIVE | REJECTED | CLOSED` · `plan`: `BASIC | VERIFIED | ELITE`.
- `bhk`, `latitude`, `longitude`, `verifiedAt`, `agentId` may be `null` (`bhk` is `null` for plots/commercial).
- `photos[].url` is a public URL, directly usable in `<img src>`. Ordered by `order` ascending — treat `photos[0]` as the cover image.
- **All of the fields between `viewCount` and `builderName`/`projectName` above are optional/nullable** — they were added for richer listing detail pages and may be `null` on older or minimally-filled-out listings. Don't assume they're always present.
- `furnishing`: `UNFURNISHED | SEMI_FURNISHED | FULLY_FURNISHED` · `facing`: `N | S | E | W | NE | NW | SE | SW` · `possessionStatus`: `READY_TO_MOVE | UNDER_CONSTRUCTION` · `ownershipType`: `FREEHOLD | LEASEHOLD | POWER_OF_ATTORNEY | CO_OPERATIVE`.
- `amenities` is a plain string array (free-form names, sourced from `GET /amenities` at listing-creation time — not a foreign key relation).
- `builderName`/`projectName` are plain strings too, not a relation — the create/edit form drives them from a static curated list of Bangalore builders/projects, but any string is accepted (a builder not on the list is fine).
- `viewCount` increments automatically whenever someone other than the listing's own seller/agent calls `GET /properties/:id` (deduped per-user per 30 minutes) — don't call it yourself to "mark as viewed."

### Offer
```json
{
  "id": "cmk…", "propertyId": "cmk…", "buyerId": "cmk…",
  "amount": 52500000, "message": "Can close within 30 days" ,
  "status": "COUNTERED", "displayStatus": "COUNTERED",
  "counterAmount": 54000000, "counterBy": "SELLER", "reviewedBy": "cmk…",
  "createdAt": "…", "updatedAt": "…",
  "propertyTitle": "Whitefield 4BHK Villa", "propertyLocation": "Whitefield, Bengaluru",
  "buyerName": "Aisha Khan"
}
```
- `status`: `PENDING_REVIEW | PENDING | ACCEPTED | REJECTED | COUNTERED`.
- For buyers, render `displayStatus` (it collapses `PENDING_REVIEW` → `PENDING` so buyers never see the internal triage step).
- `message`, `counterAmount`, `counterBy`, `reviewedBy` may be `null`.

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
- `status`: `IN_PROGRESS | CLOSED`. A deal is created `IN_PROGRESS` (agent not yet assigned — `agentId: null`); admins assign an agent, the agent records token + final payments, then closes it.
- `agentId`, token/final payment fields, `paymentMode`, `transactionRef`, `notes` are `null` until recorded.

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
{ "id": "cmk…", "title": "Offer forwarded", "message": "Your offer on … was forwarded to the seller.", "isRead": false, "createdAt": "…" }
```
`GET /notifications` additionally returns `unreadCount` alongside the pagination fields. Saved-search matches and site-visit status changes arrive here too — no separate feed to poll.

### Saved search
```json
{
  "id": "cmk…", "name": "3BHK Whitefield under 1.5Cr",
  "filters": { "q": "whitefield", "type": "RESIDENTIAL", "minBhk": 3, "maxPrice": 15000000 },
  "alertsEnabled": true, "lastAlertedAt": "2026-07-15T09:00:00.000Z",
  "createdAt": "…"
}
```
`filters` keys mirror `GET /properties` query params (`q, type, minPrice, maxPrice, minBhk, city`) — reuse the exact same object for both the saved search and the live search request.

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
`status`: `REQUESTED | SCHEDULED | COMPLETED | CANCELLED`. `agentId` is `null` until the property has (or gets) an assigned agent.

## End-to-end flows the frontend will implement

**Seller lists a property (with photos):**
1. `POST /uploads` once per photo (`bucket: "property-media"`) → collect `url`s.
2. `POST /listings` with `{ title, description, location, type, areaSqft, bhk, askingPrice, photoUrls: [url1, url2, …] }`, optionally adding any of the rich fields (`city`, `bathrooms`, `furnishing`, `amenities`, `builderName`, `projectName`, etc. — see the Property shape above) — requires the seller's KYC to be `APPROVED`, else 403.
3. Listing starts `DRAFT` → backend-ops review it via `/queue` → `LIVE` (appears in `/properties`) or `REJECTED`.

**Seller KYC:** `POST /uploads` (`bucket: "kyc-documents"`) for ID doc + selfie → `POST /kyc` with `{ idType, idDocUrl, selfieUrl }` → poll `GET /kyc` for `APPROVED`.

**Buyer makes an offer:** browse `GET /properties` → `POST /offers { propertyId, amount, message? }` → track in `GET /offers` (watch `displayStatus`) → on `COUNTERED`, respond with `PATCH /offers/:id { action: "acceptCounter" | "rejectCounter" }` → acceptance creates a Deal visible in `GET /deals`.

**Buyer shortlists a property:** `POST /shortlists { propertyId }` (heart icon on a card) → `GET /shortlists` for the "Saved properties" page → `DELETE /shortlists/:propertyId` to unsave. Safe to call POST repeatedly (idempotent).

**Buyer saves a search + gets alerted:** after filtering `GET /properties`, `POST /saved-searches { name, filters }` with the same filter object used in the query → new matching `LIVE` listings show up as `Notification`s automatically (platform-scheduled scan); a buyer can also force a check with `POST /saved-searches/run-alerts`.

**Buyer requests a site visit:** from a property detail page, `POST /site-visits { propertyId, requestedDate, buyerNote? }` → poll `GET /site-visits` for status changes (`REQUESTED → SCHEDULED → COMPLETED`, or `CANCELLED`) → `PATCH /site-visits/:id { action: "cancel" }` if the buyer needs to back out.

## The one platform rule that matters

Buyers and sellers never interact directly. Every offer passes: buyer → `PENDING_REVIEW` → backend (`/negotiations`) → forwarded to seller (`PENDING`) → seller accepts/rejects/counters → buyer accepts/rejects counter. Acceptance at any point auto-creates a `Deal`, which an admin then assigns to an agent via `/deals/:id/assign-agent`.
