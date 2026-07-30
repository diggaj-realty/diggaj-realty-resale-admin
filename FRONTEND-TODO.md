# Frontend changes required

Everything below is work for the **public site** (`diggajrealty.com`) — the customer-
facing frontend that consumes `/api/v1`. None of it lives in this repo: the internal
dashboard redirects BUYER and SELLER to `/login`, so buyers and sellers only ever see
the public site.

The backend for all of it is built, deployed to the database, and on the branch
`feat/buyer-journey-hardening`.

Ordered by urgency, not by item number.

---

## 1. BREAKING — phone is now required at buyer signup

**`POST /api/v1/auth/register` will reject a signup with no phone number.**

Ship this before, or at the same time as, the backend release. Otherwise buyer signup
returns 400 and nothing gets through.

```
POST /api/v1/auth/register
{ "name": "...", "email": "...", "password": "...", "phone": "9880011223", "role": "BUYER" }
```

- Add a phone field to the signup form, required.
- Any format is accepted — `+91 98800 11223`, `098800-11223`, `9880011223` all
  normalise to `9880011223` server-side. Don't try to normalise on the client.
- On a bad number the response is **400** with
  `Enter a valid 10-digit Indian mobile number`. Show the message as-is.
- Indian mobiles only: 10 digits starting 6–9. Landlines and short codes are rejected.

### Google sign-in is different

Google never returns a phone number, so `POST /api/v1/auth/google` cannot demand one.
It returns an extra field:

```json
{ "token": "...", "user": { ... }, "isNewUser": true, "needsPhone": true }
```

When `needsPhone` is `true`, prompt for a number before letting the user do anything
that creates a lead. `PATCH /api/v1/profile` accepts `{ "name", "phone" }`.

### Existing users

**8 buyer accounts currently have no phone number**, and 3 of them have live leads.
They cannot raise a new lead until they supply one — see item 2, which handles this
gracefully if you implement the inline prompt.

---

## 2. Collect the phone inline when raising interest

A lead cannot exist without a number to call, and this is enforced in one place so no
route can bypass it.

Both of these create a lead:

- `POST /api/v1/interests` — `{ propertyId, source, buyerNote?, buyerPhone? }`
- `POST /api/v1/properties/:id/interest` — `{ source, buyerNote?, buyerPhone? }`

**On `422` with error code semantics `BUYER_PHONE_REQUIRED`:**

```
422  "A mobile number is required before you can register interest — an agent needs
      to be able to call you."
```

Don't send the user away to a settings screen. Show a phone input in place and retry
the same request with `buyerPhone` set. That single field also fixes the 8 legacy
accounts without a migration.

`400` with the mobile-format message means the number they typed is not usable.

Note the status codes are deliberately distinct: **422 = we need a number**,
**400 = that number is wrong.** Treating both as a generic error loses the difference.

---

## 3. Post-save prompt — turn a bookmark into a lead

Saving a property is deliberately silent: `POST /api/v1/shortlists` creates a bookmark
and nothing else. No lead, no agent, no notification. That is intended — every save
becoming a lead would bury the staff queue.

So the save needs a follow-up prompt, and this is the **only** thing that turns
interest into a lead the business can act on. Without it, saves are invisible to
staff and nobody gets called.

After a successful save, show something like:

> Saved. Want an agent to call you about this one? **[Yes, contact me]** · *Not now*

"Yes" calls `POST /api/v1/properties/:id/interest` with
`{ "source": "CONTACT_REQUEST" }`, plus `buyerPhone` if item 2 applies.

Also note: **saving now fails on properties that aren't LIVE** (400, "This property is
no longer available"). Handle a stale listing page gracefully.

---

## 4. Tell the buyer their lead exists and who owns it

Raising interest returns the lead with `agentAssigned`:

```json
{ "data": { "id": "...", "status": "AGENT_ASSIGNED", "agentName": "...", "agentAssigned": true } }
```

An agent is now assigned automatically, so `agentAssigned` is true in almost all
cases. Say so — "Megan will call you shortly" rather than silence. The platform makes
an SLA promise on the agent's behalf the moment a lead is created; the buyer should
know it was made.

---

## 5. Confirm or dispute the recorded price

Staff record what was agreed on a call or at a viewing. **The buyer and seller each
confirm it themselves — staff cannot do it for them**, and the figure does not become
the deal's price until both have.

Read the current figure:

```
GET /api/v1/deals/:id/offline-negotiation
```

Each record includes:

| Field | Meaning |
|---|---|
| `agreedAmount` | The figure recorded |
| `buyerConfirmed` / `sellerConfirmed` | Who has agreed so far |
| `bothConfirmed` | True once it is the real price |
| `isDisputeOpen` | Somebody has said it is wrong |
| `isCurrent` | False once a newer figure supersedes it — respond to the live one |
| `disputedBy`, `disputedNote` | Who objected and what they said |
| `recordedByName` | The staff member who recorded it |

Show the amount **prominently** with its actual standing, then the two actions:

```
POST /api/v1/deals/:id/offline-negotiation/:negotiationId/respond
{ "action": "confirm" }
{ "action": "dispute", "note": "We said 1.65 Cr" }
```

BUYER/SELLER only. Error cases: `409 SUPERSEDED` (a newer figure exists),
`409` already confirmed.

**An open dispute blocks the deal from progressing** until staff resolve it, so make
the disputed state visibly different from "awaiting your confirmation" — the buyer
should understand they have stopped the clock.

---

## 6. Cost breakdown — acknowledge or query a line

Staff send the buyer a full breakdown of what they pay: property price, parking, club
membership, stamp duty, registration, minus any discount.

```
GET /api/v1/deals/:id/cost-sheet
```

Buyers get only the sheet actually sent to them, with internal lines already stripped
and the total recomputed from what remains — **the total will add up from the rows you
are given.** Sellers get `[]`; what the buyer is charged is not theirs to see.

Each line has `label`, `amount`, `category`, `note`, and:

- **`isEstimate: true`** — stamp duty and registration move with circle rates and the
  sub-registrar office. **Label these visibly as estimates.** A buyer who budgets off a
  firm-looking number and finds it ₹40,000 higher on the day was misled by the
  presentation, not the arithmetic.
- `category: "DEDUCTION"` — subtracts. Render with a minus sign.

Sheet-level fields: `version`, `total`, `acknowledgedAt`, `isQueryOpen`, `queriedLineId`.

Two actions, BUYER only:

```
POST /api/v1/deals/:id/cost-sheet/:sheetId/respond
{ "action": "acknowledge" }
{ "action": "query", "lineId": "<line>", "note": "What is the club membership for?" }
```

Attach a query **to the line it is about** — that is why `lineId` exists. "What is
this charge" against a named line is answerable; a complaint about the whole sheet is
not. An open query also blocks the deal, same as a disputed price.

A revised sheet arrives as a **new version needing fresh acknowledgement**. A figure
already accepted never changes underneath the buyer — if it changes, they agree again.

---

## 7. Deal progress — for buyer *and* seller

New endpoint, and the seller had nothing at all before this:

```
GET /api/v1/deals/:id/progress
```

Returns the twelve-step ladder:

```json
{
  "stage": "DOCUMENTATION_IN_PROGRESS",
  "stageLabel": "Documentation in progress",
  "source": "DECLARED",
  "steps": [{ "stage": "...", "label": "...", "reached": true, "current": false }],
  "priceConfirmed": true,
  "documents": { "approved": 2, "total": 5 }
}
```

**`source` matters and must not be flattened.**

- `DERIVED` — the platform observed this from its own records. A fact.
- `DECLARED` — a staff member recorded it. A claim, and it can move *backwards*.

Present them differently — "Confirmed by the platform" versus "Updated by your agent".
A bar that shows both identically loses the reader's trust the first time a stage
walks back, and staff-declared stages genuinely do.

What each party sees differs by design: `payments` and `costSheet` appear for the buyer
only. The seller gets the stage and document counts.

Also handle `status: "FELL_THROUGH"` — deals can now collapse (loan refused, a party
withdrew) and the property returns to market. `failureCode` and `failedAt` come with it.

---

## 8. Dispute a site visit booked on your behalf

Staff can now book a visit directly from a phone call, rather than proposing a slot and
waiting for in-app acceptance. When they do, the visit carries:

- `scheduledVia: "AGREED_OFFLINE"` — staff asserted the buyer's agreement
- `scheduledVia: "BUYER_ACCEPTED"` — the buyer confirmed it themselves

For `AGREED_OFFLINE`, show that it was booked following their call **and give them a way
to say it is wrong.** Without that, booking on someone's behalf is just taking their
diary.

The action returns the visit to a proposal, keeping the date so neither side restarts.
Only available on `AGREED_OFFLINE` bookings — a slot the buyer accepted themselves is
rescheduled, not disputed. Wire it to `disputeScheduledSiteVisit`; if you need a REST
endpoint for this rather than a server action, ask and I will add one.

---

## Cross-cutting notes

**WhatsApp is wired but dormant.** Four events will message the buyer once a provider
is configured: lead received, visit booked, price recorded, cost sheet sent. Nothing to
do on the frontend — but expect buyers to arrive already knowing, and don't design as
though the in-app notification is their first contact.

**Phone display.** Numbers are stored as 10 bare digits. Format as `98800 11223` and
build `tel:` links as `+91` + the digits.

**Status codes are meaningful.** 422 is "we need something from you", 409 is "the state
conflicts", 400 is "that input is wrong". Please don't collapse them into one error
toast — several flows above depend on the buyer seeing the difference.

---

## Not built, needs a product decision

- **Two-way messaging** on a deal (`DealLogEntry` is buyer-visible but one-way today).
  Parked deliberately — the confirm/dispute flows above cover the specific
  disagreements that were driving the request for chat.
- **`unitsAvailable`** is accepted and stored but never consumed; one accepted offer
  locks the whole property regardless. Either make units real (needs per-unit deals) or
  drop the field. No listing currently uses it.
