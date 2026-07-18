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

## The one platform rule that matters

Buyers and sellers never interact directly. Every offer passes: buyer → `PENDING_REVIEW` → backend (`/negotiations`) → forwarded to seller (`PENDING`) → seller accepts/rejects/counters → buyer accepts/rejects counter. Acceptance at any point auto-creates a `Deal`, which an admin then assigns to an agent via `/deals/:id/assign-agent`.
