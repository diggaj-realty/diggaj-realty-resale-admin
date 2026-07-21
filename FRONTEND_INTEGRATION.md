# Connecting the frontend to this backend

This file is written to be handed to Claude Code (or any coding agent) working
inside the **frontend** repo (`diggaj-realty/diggaj-realty-resale`, Next.js +
Tailwind + Framer Motion marketing site). It explains exactly what backend
exists, what's already live vs. still static/mock, and how to wire it up.

Paste this whole file into that session as context, or point Claude Code at
it, e.g.:
> "Read FRONTEND_INTEGRATION.md from the backend repo and wire up the
> Listings section to real data."

---

## 1. What you're connecting to

A separately-deployed Next.js backend that exposes a public, token-based REST
API under `/api/v1`. It is **not** the same app — it's deployed on its own
Vercel project and reached purely over HTTP. The frontend does not need
Prisma, Supabase SDKs, or any backend dependency — just `fetch`.

- **Full endpoint + JSON reference:** `API.md` in the backend repo (copy it
  into this repo too if useful, or fetch it from GitHub).
- **Base URL:**
  - **Production (live now, real Supabase DB): `https://diggaj-realty-resale-admin.vercel.app/api/v1`**
  - Local backend dev (only if you're running the backend yourself too): `http://localhost:3000/api/v1`
- **CORS:** already open (`Access-Control-Allow-Origin: *`) on every
  `/api/v1/*` route, including `OPTIONS` preflight. No proxy needed — call it
  directly from the browser.

Add to the frontend's env config — locally in `.env.local`, and as a real
Environment Variable in the frontend's own Vercel project settings once it's
deployed (same key, same value — this API is already production):
```bash
NEXT_PUBLIC_API_BASE_URL=https://diggaj-realty-resale-admin.vercel.app/api/v1
```

Quick sanity check anyone can run right now to confirm the API is live and
hitting the real DB:
```bash
curl -X POST https://diggaj-realty-resale-admin.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@demo.test","password":"password123"}'
# → {"data":{"token":"...","user":{...real DB row...}}}
```

## 2. Auth model — this is not a cookie session

The public API is **bearer-token JWT**, separate from the internal
dashboard's NextAuth cookie session. The marketing site is a different origin
entirely, so:

1. New user → `POST /auth/register` `{ name, email, password, phone?, role }`
   (`role` is `"BUYER"` or `"SELLER"`) → returns `{ token, user }` immediately,
   no separate login step needed after signup.
   Existing user → `POST /auth/login` `{ email, password }` → same shape.
2. Store `token` in `localStorage` (or a cookie you control) on the frontend.
3. Send `Authorization: Bearer <token>` on every subsequent request.
4. Token is valid 30 days — no refresh endpoint exists yet; on 401, just send
   the user back to login.

Registration only creates `BUYER` or `SELLER` accounts (self-serve, public).
`AGENT`/`BACKEND`/`ADMIN` are internal roles, not exposed to signup — don't
show those as options in any public sign-up form.

**Important — this API only authenticates `BUYER`/`SELLER` accounts.** Agent,
backend-ops, and admin are internal staff roles that sign in through a
separate internal dashboard, not through this public API — `/auth/login` and
`/auth/register` will `403`/reject anything else. You'll never need those
roles on the marketing site.

Demo accounts for testing (password `password123` for both):
`seller@demo.test`, `buyer@demo.test`.

## 3. A minimal API client to drop into the frontend

Create `lib/api.ts`:

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("diggaj_token");
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const token = opts.token ?? getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "BUYER" | "SELLER";
}) {
  const data = await api<{ token: string; user: unknown }>("/auth/register", {
    method: "POST",
    body: input,
  });
  localStorage.setItem("diggaj_token", data.token);
  return data; // already logged in — no separate login() call needed
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  localStorage.setItem("diggaj_token", data.token);
  return data;
}

export async function uploadFile(file: File, bucket: "property-media" | "kyc-documents") {
  const token = getToken();
  const form = new FormData();
  form.set("file", file);
  form.set("bucket", bucket);
  const res = await fetch(`${BASE}/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Upload failed");
  return json.data.url as string;
}
```

Every list endpoint returns `{ items, page, pageSize, total, totalPages }` —
`api<{ items: Property[]; total: number }>("/properties")`.

## 4. Which frontend sections need real data (and which don't)

| Component | File | Status | What to do |
|---|---|---|---|
| `Hero` | `components/Hero.tsx` | **static, leave as-is** | Hardcoded showcase prices/images are intentional hero art — no API call needed. |
| `Listings` | `components/Listings.tsx` | **wire to real data** | Replace the `LISTINGS` constant with `GET /properties?pageSize=6` on mount (or as a server component with `fetch`). Map each `Property` → `{ img: photos[0]?.url, title, price: askingPrice, address: location, beds: bhk, baths: bathrooms, badge }`. `bathrooms` now exists on the API response (see `API.md`) — no need to fake it, though it can be `null` on older/incomplete listings. |
| New: shortlist / "Save" heart | (doesn't exist yet) | **build new** | `POST /shortlists { propertyId }` (idempotent) / `DELETE /shortlists/:propertyId`; `GET /shortlists` for a "Saved properties" page (BUYER only). |
| New: saved search / "Alert me" | (doesn't exist yet) | **build new** | On the search/browse page, `POST /saved-searches { name, filters }` using the same `filters` object as the current `GET /properties` query. Matches notify the buyer automatically — no polling needed beyond `GET /notifications`. |
| New: "Request a visit" on property detail | (doesn't exist yet) | **build new** | `POST /site-visits { propertyId, requestedDate, buyerNote? }`; track status via `GET /site-visits`. |
| `ExploreMap` | `components/ExploreMap.tsx` | **static, leave as-is** | Decorative animated map with hardcoded pins — this is art direction, not a real map. Leave unless the user explicitly asks for a real interactive map (bigger task, would need `latitude`/`longitude` from `Property`). |
| `HowItWorks`, `SaveMore`, `ValueProp`, `BuySell` | — | **static, leave as-is** | Marketing copy, no data dependency. |
| `Footer` "Get started" | `components/Footer.tsx` | **link to auth** | Point at the sign-up page (below). |
| New: sign-up / login pages | (doesn't exist yet) | **build new** | `POST /auth/register` (Buyer/Seller toggle) and `POST /auth/login`. See flows below. |
| New: property detail page | (doesn't exist yet) | **build new** | `GET /properties/:id` → full `Property` with `photos[]`. |
| New: buyer offer flow | (doesn't exist yet) | **build new** | `POST /offers { propertyId, amount, message? }` once a buyer is logged in. |
| New: seller listing flow | (doesn't exist yet) | **build new** | Multi-step: KYC (if not approved) → photo upload → `POST /listings`. See flows below. |

## 5. Key flows to implement

**Sign up:**
1. Build a form asking for name, email, password, phone (optional), and
   "I am a…" Buyer/Seller toggle.
2. `register({ name, email, password, phone, role })` — on success the user
   already has a valid token (no separate login step). Redirect them straight
   into their buyer/seller experience.
3. `409` → "an account with this email already exists" — offer a link to log
   in instead. `400` → show the validation message inline (e.g. password too
   short).
4. Sellers aren't required to complete KYC at signup — prompt for it the
   first time they try to list a property (see below), not during registration.

**Property browse/search (public-facing "Featured Listings" grid and any
future search page):**
```ts
const { items, total } = await api<{ items: Property[]; total: number }>(
  `/properties?q=${encodeURIComponent(query)}&type=${type}&page=${page}`
);
```
Only `LIVE` properties are returned — no filtering needed client-side.

**Seller onboarding + listing creation:**
1. Check `GET /kyc` — if `null` or `status !== "APPROVED"`, route to a KYC form.
2. KYC form: upload ID doc + selfie via `uploadFile(file, "kyc-documents")`,
   then `POST /kyc { idType, idDocUrl, selfieUrl }`. Show "pending review" state.
3. Once approved, listing form: upload each photo via
   `uploadFile(file, "property-media")` to collect `photoUrls`, then
   `POST /listings { title, description, location, type, areaSqft, bhk, askingPrice, photoUrls }`.
4. New listings start `DRAFT` and won't appear publicly until backend-ops
   approves them — show the seller a "pending verification" state, don't
   imply it's live immediately.

**Buyer makes an offer → tracks status:**
1. From a property detail page: `POST /offers { propertyId, amount, message? }`.
2. "My Offers" page: `GET /offers` (as buyer) → render `displayStatus`, not
   `status` (it collapses the internal `PENDING_REVIEW` triage step into
   `PENDING` so buyers never see backend-internal states).
3. If `displayStatus === "COUNTERED"`, show the `counterAmount` and let the
   buyer respond: `PATCH /offers/:id { action: "acceptCounter" }` or
   `{ action: "rejectCounter" }`.
4. On acceptance, a Deal is created automatically — if you build a "my deals"
   view, `GET /deals` (as buyer) shows it.

Full JSON shapes for `Property`, `Offer`, `Deal`, `KYC`, `Notification` are in
`API.md` — copy those TypeScript-able shapes into `types/api.ts` on the
frontend rather than re-guessing field names.

## 6. Error handling & UX conventions to match

- Every error response is `{ error: { message: string } }` — surface
  `message` directly, it's already written to be user-facing (e.g. "KYC must
  be approved before creating a listing").
- `401` → token missing/expired/invalid → clear stored token, redirect to login.
- `403` → wrong role or not the resource owner → generally shouldn't happen
  if the UI only shows actions valid for the logged-in role; if it does,
  show a generic "you don't have access to do that" toast.
- `400` → validation error, `message` explains what's wrong — show inline.

## 7. What NOT to do

- Don't call Supabase directly from the frontend — all storage/DB access
  goes through this API. There's no public Supabase key exposed for the
  frontend to use.
- Don't cache the JWT in a way that survives a role change — there's no
  server-push invalidation; if something looks stale after 30 days, that's
  expected, just re-login.
- Don't build a second copy of business rules (e.g. "buyers and sellers
  negotiate directly") — the backend enforces the actual flow (buyer → offer
  → backend triage → seller → deal → agent). The frontend should reflect
  status, not reimplement the state machine.
