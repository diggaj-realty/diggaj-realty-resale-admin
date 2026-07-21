# Resale Platform API (v1)

Base URL:
- Local: `http://localhost:3000/api/v1`
- Production: `https://<your-vercel-domain>/api/v1`

CORS is open (`Access-Control-Allow-Origin: *`) so this can be called from any origin/port.

## Auth

Token-based, not cookies. Log in once, then send the token on every other request.

```
POST /api/v1/auth/login
Content-Type: application/json
{ "email": "buyer@demo.test", "password": "password123" }

→ 200 { "data": { "token": "<jwt>", "user": { id, name, email, phone, role, isActive, createdAt, updatedAt } } }
```

Send the token on every subsequent request:
```
Authorization: Bearer <jwt>
```
Tokens are valid 30 days. `GET /api/v1/auth/me` returns the current user (validates the token and that the account is still active).

Demo accounts (password `password123` for all): `seller@demo.test`, `buyer@demo.test`, `agent@demo.test`, `backend@demo.test`, `admin@demo.test`.

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
| GET | `/properties` | any | — paginated, `?q=` search, `?type=` filter | LIVE properties only (buyer browse) |
| GET | `/properties/:id` | any | — | single property + photos |
| GET | `/listings` | SELLER/AGENT/ADMIN/BACKEND | — paginated | role-scoped: seller sees own, agent sees assigned, admin/backend see all |
| POST | `/listings` | SELLER | `{ title, description, location, type, areaSqft, bhk, askingPrice, photoUrls[] }` | requires approved KYC; `type` one of `RESIDENTIAL/PLOT/COMMERCIAL`; starts as `DRAFT` |
| GET | `/queue` | BACKEND | — paginated | listings awaiting verification (`DRAFT`/`PENDING_VERIFICATION`) |
| POST | `/queue/:id/review` | BACKEND | `{ decision: "LIVE" \| "REJECTED" }` | |

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
  "status": "LIVE", "plan": "BASIC",
  "verifiedAt": "2026-07-10T08:30:00.000Z",
  "createdAt": "2026-07-05T08:30:00.000Z", "updatedAt": "2026-07-10T08:30:00.000Z",
  "sellerName": "Rohan Mehta", "agentName": null,
  "photos": [ { "id": "cmk…", "url": "https://…supabase.co/storage/v1/object/public/property-media/…", "order": 0 } ]
}
```
- `type`: `RESIDENTIAL | PLOT | COMMERCIAL` · `status`: `DRAFT | PENDING_VERIFICATION | LIVE | REJECTED | CLOSED` · `plan`: `BASIC | VERIFIED | ELITE`.
- `bhk`, `latitude`, `longitude`, `verifiedAt`, `agentId` may be `null` (`bhk` is `null` for plots/commercial).
- `photos[].url` is a public URL, directly usable in `<img src>`. Ordered by `order` ascending — treat `photos[0]` as the cover image.

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
`GET /notifications` additionally returns `unreadCount` alongside the pagination fields.

## End-to-end flows the frontend will implement

**Seller lists a property (with photos):**
1. `POST /uploads` once per photo (`bucket: "property-media"`) → collect `url`s.
2. `POST /listings` with `{ title, description, location, type, areaSqft, bhk, askingPrice, photoUrls: [url1, url2, …] }` (requires the seller's KYC to be `APPROVED`, else 403).
3. Listing starts `DRAFT` → backend-ops review it via `/queue` → `LIVE` (appears in `/properties`) or `REJECTED`.

**Seller KYC:** `POST /uploads` (`bucket: "kyc-documents"`) for ID doc + selfie → `POST /kyc` with `{ idType, idDocUrl, selfieUrl }` → poll `GET /kyc` for `APPROVED`.

**Buyer makes an offer:** browse `GET /properties` → `POST /offers { propertyId, amount, message? }` → track in `GET /offers` (watch `displayStatus`) → on `COUNTERED`, respond with `PATCH /offers/:id { action: "acceptCounter" | "rejectCounter" }` → acceptance creates a Deal visible in `GET /deals`.

## The one platform rule that matters

Buyers and sellers never interact directly. Every offer passes: buyer → `PENDING_REVIEW` → backend (`/negotiations`) → forwarded to seller (`PENDING`) → seller accepts/rejects/counters → buyer accepts/rejects counter. Acceptance at any point auto-creates a `Deal`, which an admin then assigns to an agent via `/deals/:id/assign-agent`.
