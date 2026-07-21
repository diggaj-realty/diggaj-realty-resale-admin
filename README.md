# Diggaj Realty — Resale Backend & Dashboard

Role-based dashboard (Seller / Buyer / Agent / Backend-ops / Admin) plus a public
REST API (`/api/v1`) that the marketing frontend
([diggaj-realty-resale](https://github.com/diggaj-realty/diggaj-realty-resale))
consumes for listings, property browsing, offers, deals, KYC, and file uploads.

**Stack:** Next.js 16 (App Router) · Prisma 7 · Supabase (Postgres + Storage) ·
NextAuth (dashboard sessions) + JWT bearer tokens (public API) · Tailwind 4 · GSAP · Recharts.

## Local development

```bash
npm install                 # runs prisma generate automatically
cp .env.example .env.local  # fill in real values (see below)
npm run dev                 # http://localhost:3000
```

Demo login (all roles, password `password123`): `seller@demo.test`,
`buyer@demo.test`, `agent@demo.test`, `backend@demo.test`, `admin@demo.test`.
Seed with `npm run db:seed` if the database is empty.

## Environment variables

All keys are documented in [`.env.example`](.env.example):

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres, **pooled** (port 6543, `?pgbouncer=true`) — app runtime |
| `DIRECT_URL` | Supabase Postgres, **direct** (port 5432) — Prisma migrations |
| `NEXTAUTH_SECRET` | Signs dashboard session cookies **and** API bearer JWTs |
| `NEXTAUTH_URL` | Canonical URL of this deployment |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Server-side Storage uploads (`/api/v1/uploads`) |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase client config |

## Deploying to Vercel

1. **Import the repo** at vercel.com/new (framework auto-detects Next.js;
   `npm run build` already runs `prisma generate`).
2. **Set the env vars** above in *Project → Settings → Environment Variables*
   — copy values from your local `.env.local` / the Supabase dashboard, and set
   `NEXTAUTH_URL` to the production URL (e.g. `https://<app>.vercel.app`).
   Use a fresh `NEXTAUTH_SECRET` in production (`openssl rand -base64 32`).
3. **Deploy.** The database is already migrated/seeded in Supabase, so no
   release step is needed. (For future schema changes: `npx prisma db push`
   locally against `DIRECT_URL`.)
4. Point the frontend's API base URL at `https://<app>.vercel.app/api/v1`.
   CORS is open (`*`) on all `/api/v1` routes, so any frontend origin works.

**This project is already deployed.** Live production API:
`https://diggaj-realty-resale-admin.vercel.app/api/v1` — see
[`FRONTEND_INTEGRATION.md`](FRONTEND_INTEGRATION.md) for the frontend
connection guide.

## API for the frontend

Full reference with request/response JSON shapes: [`API.md`](API.md).

- Auth: `POST /api/v1/auth/login` → `{ token }`, then `Authorization: Bearer <token>` (30-day JWTs).
- Envelope: success `{ "data": ... }`, error `{ "error": { "message" } }`,
  lists `{ items, page, pageSize, total, totalPages }`.
- Uploads: `POST /api/v1/uploads` (multipart) → public/signed URL, then pass
  the URL in the JSON body of `POST /listings`, `POST /kyc`, etc.

## Core platform rule

Buyers and sellers never interact directly. Every offer flows
buyer → backend triage (`/negotiations`) → seller → (counter/accept) →
auto-created **Deal** → admin assigns an agent → agent records token/final
payment and closes.
