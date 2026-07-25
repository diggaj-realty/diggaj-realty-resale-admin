# Frontend Handover — Recent API Changes

**Audience:** the team building the buyer/seller-facing consumer app (the "frontend" that talks to `/api/v1/*`). This is a changelog of what's new/changed on the backend since `BUYER_SELLER_SPEC.md` was written — read that doc first for the full picture; this one is just the delta that needs frontend action.

---

## 1. Google Sign-In is now available — new endpoint

**`POST /api/v1/auth/google`** — a Google-based alternative to `/auth/register` + `/auth/login`, same response shape as both.

### What you need to build

1. **Add Google Identity Services (GIS) to the app**, using this Client ID (already provisioned, shared across this API and the internal dashboard — no separate Google Cloud setup needed on your end):
   ```
   721185759856-h1ka6128h2opd8hmnlab78n5qjak87ab.apps.googleusercontent.com
   ```
   Script tag:
   ```html
   <script src="https://accounts.google.com/gsi/client" async defer></script>
   ```
   Init + render (or use `@react-oauth/google` if the app is React — same client ID, same result):
   ```js
   google.accounts.id.initialize({
     client_id: '721185759856-h1ka6128h2opd8hmnlab78n5qjak87ab.apps.googleusercontent.com',
     callback: handleGoogleResponse,
   })
   google.accounts.id.renderButton(document.getElementById('google-btn'), { theme: 'outline', size: 'large' })
   ```
   **Nothing about this is automatic** — you must add a mount element (e.g. `<div id="google-btn">`) somewhere on your login/signup screen and call `renderButton()` pointing at it. Google draws the button itself once you do; it does not appear on its own.

2. **Send the ID token to our API:**
   ```js
   async function handleGoogleResponse(response) {
     const res = await fetch('https://resale-admin.diggajrealty.com/api/v1/auth/google', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         idToken: response.credential,   // from GIS
         role: 'BUYER',                  // or 'SELLER' — whichever flow the user is in
         phone: undefined,               // optional
       }),
     })
     const { data } = await res.json()
     // data.token      → bearer token, store it exactly like after /auth/register or /auth/login
     // data.user       → { id, name, email, role, ... }
     // data.isNewUser  → true on this Google account's first-ever sign-in here
   }
   ```
   From here it's identical to password auth: attach `Authorization: Bearer <data.token>` on every subsequent request.

3. **Response codes to handle:**
   - `200` — existing account, signed in.
   - `201` — brand-new account created (`isNewUser: true`) — good moment to show a "complete your profile" step (phone number, etc.) since it wasn't collected.
   - `401` — bad/expired/wrong-audience Google token, or the Google account's email isn't verified. Treat like any failed sign-in.
   - `409` — this email is already registered as **internal staff** (agent/ops/admin). Show something like "This email is used internally — please use a different Google account," since staff never sign in through this app.

### Domain checklist (needs your confirmation)

- Whatever domain this frontend is actually served from must be added to **Authorized JavaScript origins** on the Google Cloud OAuth client. `https://diggajrealty.com` is already added — confirm that's the real production domain for this app.
- Local dev origins (e.g. `http://localhost:3000` or wherever this runs locally) need adding too, or the button will fail with an origin-mismatch error in the browser console during development. Let us know your local dev port(s) if you need this added.
- No redirect URI setup needed on your side — that's only for the internal dashboard's server-side flow, not this client-side GIS flow.

### Optional: Google One Tap

Separate from the button — a small corner prompt that can appear automatically via `google.accounts.id.prompt()`. Not required; most apps skip it and just use the button. Mention if you want it and we can confirm it's compatible with the same setup.

---

## 2. Sellers can now read their own site visits (was a gap before)

`GET /api/v1/site-visits` now accepts the `SELLER` role in addition to `BUYER`/`AGENT`. A seller sees (read-only — no schedule/cancel actions) the visits requested on their own properties, scoped by `property.sellerId`. Same response shape (`siteVisitDTO`) as the buyer/agent views. Useful for a "who's coming to see my listing" screen on the seller side, called out as a gap in the original spec — now closed.

---

---

## 3. Six backend-blocked items from your audit are now closed

Responding point-by-point to the "Backend-blocked" list you sent — six of eight are now built and live; the remaining two need a product decision (see below), not more backend work.

### Negotiation timeline (item 1 — shared) — closed
`GET /api/v1/offers/:id` (new) returns a single offer with a full `events[]` timeline — every `CREATED`/`FORWARDED`/`COUNTERED_BACKEND`/`COUNTERED_SELLER`/`ACCEPTED`/`REJECTED`/`COUNTER_ACCEPTED`/`COUNTER_REJECTED` step, oldest first:
```json
{ "id": "...", "type": "COUNTERED_SELLER", "amount": 5300000, "actorRole": "SELLER", "note": null, "createdAt": "..." }
```
`actorRole` is `BUYER`, `SELLER`, or `BACKEND` — note that backend-triage steps (`FORWARDED`, `COUNTERED_BACKEND`) **do appear** in this timeline, even though the offer's own notification copy hides that a backend reviewer was involved. That's a deliberate call: `counterAmount`/`counterBy` on the plain offer object already exposed `"BACKEND"` before this change, so hiding it from the timeline too would've been inconsistent, not more private. Flag it if you'd rather we filter those out.

A seller still gets `404` (not `403`) calling this on an offer that hasn't been forwarded yet — same "don't reveal it exists" behavior the list endpoint already had.

`GET /offers` (the list endpoint) still does **not** include `events` — fetch the single-offer endpoint when a user opens one offer's detail/timeline view, to keep the list light.

Build one shared timeline component for both buyer and seller views — same event shape on both sides.

### Edit/delete a listing (item 2 — seller) — closed
```
PATCH /api/v1/properties/:id     (seller, owns it)
DELETE /api/v1/properties/:id    (seller, owns it)
```
- `PATCH` accepts any subset of the same fields `POST /listings` takes. **No status restriction** — editing a `LIVE` listing doesn't pull it back into review. `photoUrls`, if you send it, **fully replaces** the photo set — send the complete list you want, not just new additions; omit the field entirely to leave photos alone.
- `DELETE` removes the listing and its Storage photos. Returns `409` if a `Deal` already exists on it (sale in progress — can't delete out from under it).

### unitsAvailable on create (item 3 — seller) — closed
`POST /api/v1/listings` now accepts and validates `unitsAvailable` (positive whole number, defaults to `1` if omitted). It was already a real, readable column — just silently ignored on write before.

### Owner-listed-only filter (item 6 — buyer) — closed
`GET /api/v1/properties?ownerOnly=true` — excludes any property with an assigned agent (`agentId != null`). Confirmed via `propertySearch.ts`, so this was a real gap, not a mis-flag — good catch.

### Locality price snapshot (item 7 — buyer) — partially closed
`GET /api/v1/insights/locality-price?city=Bangalore&locality=Whitefield` → `{ city, locality, sampleSize, avgPrice, avgPricePerSqft }`, computed live from `LIVE` listings. **This is a current snapshot only — still no trend arrow.** Confirmed there's genuinely no price-history model in the schema to compute "up/down N% vs last quarter" against; that part of item 7 is correctly still blocked, not just unbuilt.

### Recently viewed via real history (item 8 — buyer) — closed
`GET /api/v1/properties/recently-viewed` — the buyer's own view history, deduped by property (viewed 5 times → shows once, at the latest time), most recent first. Each item is a full property object plus `viewedAt`.

### Still blocked — need a product decision, not more backend work

**Item 4 — Plan upgrade (BASIC→VERIFIED/ELITE) as a real transaction.** Not built. This needs a payment-provider decision (Razorpay/Stripe/etc. via the Vercel Marketplace, or handled off-platform) before there's anything sensible to build against. Let us know which way you want to go and we'll wire it up.

**Item 5 — Phone-number reveal.** Not built. DTOs still only expose `sellerName`/`agentName`, no phone field, on purpose — this needs a privacy/consent call: raw reveal, a masked number, or a call-relay service. Tell us which model you want and we'll add the field/endpoint to match.

Everything else in `BUYER_SELLER_SPEC.md` not mentioned above or in section 1–2 of this doc is unchanged.
