/**
 * Seeds 10 realistic demo properties with real photography pulled from Unsplash.
 *
 *   npm run db:seed:properties                        # fill in whatever is missing
 *   npm run db:seed:properties -- --reset             # rebuild all 10 rows
 *   npm run db:seed:properties -- --refresh-photos    # also pull new imagery
 *
 * Additive and idempotent — it only ever touches the rows it owns (ids prefixed
 * `seed-unsplash-`), so it is safe to re-run against a database holding real
 * listings. Everything hangs off one clearly-labelled placeholder seller
 * (dummy-seed@diggajrealty.local) and is left unassigned: dropping fake
 * listings into a real agent's queue would be worse than the missing coverage.
 *
 * Photos are fetched from Unsplash, then re-hosted in the same Supabase
 * `property-media` bucket real uploads land in, so seeded listings render
 * through exactly the same path as production ones. Photographer credits are
 * written to `prisma/seed-photo-credits.json` — Unsplash's API terms require
 * attribution wherever these images are shown to end users, and the
 * PropertyPhoto table has nowhere to keep it.
 *
 * Requires UNSPLASH_ACCESS_KEY plus the usual DATABASE_URL / SUPABASE_* vars.
 */
import { config as loadEnv } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// .env.local wins over .env, matching how Next.js itself resolves them — the
// Unsplash keys live in .env.local while DATABASE_URL/SUPABASE_* are in .env.
loadEnv({ path: join(__dirname, '..', '.env') })
loadEnv({ path: join(__dirname, '..', '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { uploadFile } from '../src/lib/upload'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const ID_PREFIX = 'seed-unsplash-'
const PHOTOS_PER_LISTING = 3
const UTM = 'utm_source=diggaj_realty&utm_medium=referral'

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
if (!ACCESS_KEY) {
  console.error('Missing UNSPLASH_ACCESS_KEY — add it to .env.local (see .env.example).')
  process.exit(1)
}

/** Unsplash search queries, kept few and reused so one run stays well inside
 *  the 50 requests/hour demo-app rate limit. */
const QUERY = {
  apartment: 'modern apartment living room interior',
  luxuryFlat: 'luxury apartment interior penthouse',
  villa: 'modern villa house exterior',
  facade: 'apartment building facade india',
} as const

/** The placeholder seller every seeded listing belongs to — named so it is
 *  obvious in the admin UI that these rows aren't real inventory. */
const SEED_SELLER = {
  email: 'dummy-seed@diggajrealty.local',
  name: 'Dummy Seed Data',
} as const

type Listing = {
  n: number
  query: string
  status: 'LIVE' | 'PENDING_VERIFICATION' | 'DRAFT'
  plan: 'BASIC' | 'VERIFIED' | 'ELITE'
  data: Record<string, unknown>
}

/** All residential, Bangalore-weighted (the platform's home market) with a few
 *  other metros. Spread across BHK counts, statuses and plans so every dashboard
 *  filter has something in it. */
const LISTINGS: Listing[] = [
  {
    n: 1,
    query: QUERY.apartment,
    status: 'LIVE',
    plan: 'VERIFIED',
    data: {
      type: 'RESIDENTIAL',
      title: 'Prestige Lakeside Habitat 3BHK',
      description:
        'East-facing 3BHK in Prestige Lakeside Habitat with a lake-side view, in a gated township with a clubhouse and pool. Walking distance to Varthur Main Road.',
      location: 'Whitefield, Bangalore',
      city: 'Bangalore',
      locality: 'Whitefield',
      pincode: '560066',
      latitude: 12.9698,
      longitude: 77.7499,
      areaSqft: 1860,
      carpetAreaSqft: 1420,
      builtUpAreaSqft: 1660,
      superBuiltUpAreaSqft: 1860,
      bhk: 3,
      bathrooms: 3,
      balconies: 2,
      askingPrice: 19500000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'E',
      floorNumber: 9,
      totalFloors: 18,
      ageYears: 4,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      reraId: 'PRM/KA/RERA/1251/446/PR/171014/001278',
      priceNegotiable: true,
      maintenanceMonthly: 4800,
      builderName: 'Prestige Group',
      projectName: 'Prestige Lakeside Habitat',
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Swimming Pool', 'Clubhouse', 'Gated Community'],
    },
  },
  {
    n: 2,
    query: QUERY.apartment,
    status: 'LIVE',
    plan: 'ELITE',
    data: {
      type: 'RESIDENTIAL',
      title: 'Brigade Cornerstone Utopia 2BHK',
      description:
        'Compact, efficiently laid out 2BHK inside Brigade Cornerstone Utopia. Township has its own retail street, school and 8-acre park — strong rental demand from the Whitefield tech corridor.',
      location: 'Varthur, Bangalore',
      city: 'Bangalore',
      locality: 'Varthur',
      pincode: '560087',
      latitude: 12.9364,
      longitude: 77.7411,
      areaSqft: 1245,
      carpetAreaSqft: 940,
      builtUpAreaSqft: 1110,
      superBuiltUpAreaSqft: 1245,
      bhk: 2,
      bathrooms: 2,
      balconies: 1,
      askingPrice: 12800000,
      furnishing: 'UNFURNISHED',
      facing: 'NE',
      floorNumber: 12,
      totalFloors: 24,
      ageYears: 2,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      reraId: 'PRM/KA/RERA/1251/446/PR/190401/002455',
      priceNegotiable: false,
      maintenanceMonthly: 3600,
      builderName: 'Brigade Group',
      projectName: 'Brigade Cornerstone Utopia',
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Swimming Pool', "Children's Play Area", 'Park / Garden', 'Gated Community'],
    },
  },
  {
    n: 3,
    query: QUERY.facade,
    status: 'LIVE',
    plan: 'VERIFIED',
    data: {
      type: 'RESIDENTIAL',
      title: 'Sobha Dream Acres 3BHK',
      description:
        'Well-maintained 3BHK on a high floor at Sobha Dream Acres, Panathur. Balcony opens onto the central landscaped court; two covered parking bays included.',
      location: 'Panathur, Bangalore',
      city: 'Bangalore',
      locality: 'Panathur',
      pincode: '560103',
      latitude: 12.9352,
      longitude: 77.6975,
      areaSqft: 1590,
      carpetAreaSqft: 1215,
      builtUpAreaSqft: 1430,
      superBuiltUpAreaSqft: 1590,
      bhk: 3,
      bathrooms: 3,
      balconies: 2,
      askingPrice: 16400000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'N',
      floorNumber: 14,
      totalFloors: 22,
      ageYears: 5,
      parkingCovered: 2,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      reraId: 'PRM/KA/RERA/1251/446/PR/171016/000891',
      priceNegotiable: true,
      maintenanceMonthly: 4200,
      builderName: 'Sobha Limited',
      projectName: 'Sobha Dream Acres',
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Clubhouse', 'Water Supply', 'Fire Safety', 'Rain Water Harvesting'],
    },
  },
  {
    n: 4,
    query: QUERY.luxuryFlat,
    status: 'LIVE',
    plan: 'ELITE',
    data: {
      type: 'RESIDENTIAL',
      title: '4BHK Penthouse at Godrej Reflections',
      description:
        'Duplex penthouse with a private terrace and skyline views over Harlur Lake. Imported fittings throughout, fully furnished including a modular kitchen — move-in ready.',
      location: 'Harlur, Bangalore',
      city: 'Bangalore',
      locality: 'Harlur',
      pincode: '560102',
      latitude: 12.9081,
      longitude: 77.6636,
      areaSqft: 3450,
      carpetAreaSqft: 2680,
      builtUpAreaSqft: 3120,
      superBuiltUpAreaSqft: 3450,
      bhk: 4,
      bathrooms: 4,
      balconies: 3,
      askingPrice: 52000000,
      furnishing: 'FULLY_FURNISHED',
      facing: 'SE',
      floorNumber: 21,
      totalFloors: 22,
      ageYears: 3,
      parkingCovered: 3,
      parkingOpen: 1,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      reraId: 'PRM/KA/RERA/1251/446/PR/180213/001905',
      priceNegotiable: true,
      maintenanceMonthly: 12500,
      builderName: 'Godrej Properties',
      projectName: 'Godrej Reflections',
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Swimming Pool', 'Clubhouse', 'Park / Garden', 'Gated Community', 'Fire Safety'],
    },
  },
  {
    n: 5,
    query: QUERY.villa,
    status: 'PENDING_VERIFICATION',
    plan: 'BASIC',
    data: {
      type: 'RESIDENTIAL',
      title: 'Independent 4BHK Villa on Sarjapur Road',
      description:
        'Corner-plot independent villa on a 30x50 site with a private garden and covered car porch. Borewell plus Cauvery connection; solar water heating already installed.',
      location: 'Sarjapur Road, Bangalore',
      city: 'Bangalore',
      locality: 'Sarjapur Road',
      pincode: '560035',
      latitude: 12.8998,
      longitude: 77.6906,
      areaSqft: 2950,
      carpetAreaSqft: 2380,
      builtUpAreaSqft: 2700,
      superBuiltUpAreaSqft: 2950,
      bhk: 4,
      bathrooms: 4,
      balconies: 2,
      askingPrice: 34500000,
      furnishing: 'UNFURNISHED',
      facing: 'W',
      floorNumber: 0,
      totalFloors: 2,
      ageYears: 8,
      parkingCovered: 2,
      parkingOpen: 2,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      priceNegotiable: true,
      maintenanceMonthly: 2500,
      amenities: ['Car Parking', '24x7 Security', 'CCTV', 'Park / Garden', 'Water Supply', 'Rain Water Harvesting'],
    },
  },
  {
    n: 6,
    query: QUERY.facade,
    status: 'LIVE',
    plan: 'BASIC',
    data: {
      type: 'RESIDENTIAL',
      title: '2BHK near Electronic City Phase 1',
      description:
        'Practical 2BHK in a 96-unit gated community off Hosur Road, a 10-minute drive to Electronic City Phase 1. Borewell plus BWSSB water; society has its own DG backup for common areas and lifts.',
      location: 'Electronic City, Bangalore',
      city: 'Bangalore',
      locality: 'Electronic City Phase 1',
      pincode: '560100',
      latitude: 12.8452,
      longitude: 77.6602,
      areaSqft: 1120,
      carpetAreaSqft: 860,
      builtUpAreaSqft: 1010,
      superBuiltUpAreaSqft: 1120,
      bhk: 2,
      bathrooms: 2,
      balconies: 1,
      askingPrice: 7200000,
      furnishing: 'UNFURNISHED',
      facing: 'N',
      floorNumber: 4,
      totalFloors: 8,
      ageYears: 9,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      priceNegotiable: true,
      maintenanceMonthly: 2400,
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', "Children's Play Area", 'Water Supply'],
    },
  },
  {
    n: 7,
    query: QUERY.luxuryFlat,
    status: 'LIVE',
    plan: 'VERIFIED',
    data: {
      type: 'RESIDENTIAL',
      title: 'Prestige Falcon City 3BHK, Kanakapura Road',
      description:
        'South-facing 3BHK in Prestige Falcon City with a clear view over the township park. Metro Phase 2 station on Kanakapura Road is a short walk away; two covered bays and a servant toilet included.',
      location: 'Kanakapura Road, Bangalore',
      city: 'Bangalore',
      locality: 'Konanakunte',
      pincode: '560062',
      latitude: 12.8848,
      longitude: 77.5613,
      areaSqft: 1725,
      carpetAreaSqft: 1330,
      builtUpAreaSqft: 1550,
      superBuiltUpAreaSqft: 1725,
      bhk: 3,
      bathrooms: 3,
      balconies: 2,
      askingPrice: 17800000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'S',
      floorNumber: 7,
      totalFloors: 15,
      ageYears: 6,
      parkingCovered: 2,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      reraId: 'PRM/KA/RERA/1251/446/PR/171015/000643',
      priceNegotiable: true,
      maintenanceMonthly: 4500,
      builderName: 'Prestige Group',
      projectName: 'Prestige Falcon City',
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Swimming Pool', 'Clubhouse', 'Park / Garden', 'Gated Community'],
    },
  },
  {
    n: 8,
    query: QUERY.apartment,
    status: 'LIVE',
    plan: 'VERIFIED',
    data: {
      type: 'RESIDENTIAL',
      title: 'Hiranandani Gardens 2BHK, Powai',
      description:
        'Bright 2BHK in Hiranandani Gardens with a partial Powai Lake view. Society has its own school, hospital and market within the campus; 10 minutes to the JVLR junction.',
      location: 'Powai, Mumbai',
      city: 'Mumbai',
      locality: 'Powai',
      pincode: '400076',
      latitude: 19.1197,
      longitude: 72.9051,
      areaSqft: 1080,
      carpetAreaSqft: 790,
      builtUpAreaSqft: 950,
      superBuiltUpAreaSqft: 1080,
      bhk: 2,
      bathrooms: 2,
      balconies: 1,
      askingPrice: 32500000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'NW',
      floorNumber: 8,
      totalFloors: 14,
      ageYears: 12,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'CO_OPERATIVE',
      priceNegotiable: true,
      maintenanceMonthly: 7500,
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Clubhouse', 'Gated Community'],
    },
  },
  {
    n: 9,
    query: QUERY.facade,
    status: 'LIVE',
    plan: 'BASIC',
    data: {
      type: 'RESIDENTIAL',
      title: '3BHK in Kharadi, Pune',
      description:
        'Under-construction 3BHK in Kharadi, a short drive from EON IT Park. Possession expected mid-2027; construction-linked payment plan available from the developer.',
      location: 'Kharadi, Pune',
      city: 'Pune',
      locality: 'Kharadi',
      pincode: '411014',
      latitude: 18.5515,
      longitude: 73.9403,
      areaSqft: 1420,
      carpetAreaSqft: 1080,
      builtUpAreaSqft: 1280,
      superBuiltUpAreaSqft: 1420,
      bhk: 3,
      bathrooms: 3,
      balconies: 2,
      askingPrice: 14200000,
      furnishing: 'UNFURNISHED',
      facing: 'S',
      floorNumber: 11,
      totalFloors: 19,
      ageYears: 0,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'UNDER_CONSTRUCTION',
      possessionDate: '2027-06-30',
      ownershipType: 'FREEHOLD',
      reraId: 'P52100047821',
      priceNegotiable: true,
      maintenanceMonthly: 3200,
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'Gymnasium', "Children's Play Area", 'Rain Water Harvesting'],
    },
  },
  {
    n: 10,
    query: QUERY.apartment,
    status: 'PENDING_VERIFICATION',
    plan: 'BASIC',
    data: {
      type: 'RESIDENTIAL',
      title: 'Compact 1BHK in Gachibowli, Hyderabad',
      description:
        'Low-maintenance 1BHK on the Gachibowli–Nanakramguda stretch, walking distance to the Financial District. Currently tenanted at ₹19,000/month — an investor-ready resale with the lease running to early 2027.',
      location: 'Gachibowli, Hyderabad',
      city: 'Hyderabad',
      locality: 'Gachibowli',
      pincode: '500032',
      latitude: 17.4401,
      longitude: 78.3489,
      areaSqft: 685,
      carpetAreaSqft: 520,
      builtUpAreaSqft: 615,
      superBuiltUpAreaSqft: 685,
      bhk: 1,
      bathrooms: 1,
      balconies: 1,
      askingPrice: 5400000,
      furnishing: 'FULLY_FURNISHED',
      facing: 'W',
      floorNumber: 3,
      totalFloors: 11,
      ageYears: 6,
      parkingCovered: 1,
      parkingOpen: 0,
      possessionStatus: 'READY_TO_MOVE',
      ownershipType: 'FREEHOLD',
      priceNegotiable: true,
      maintenanceMonthly: 2200,
      amenities: ['Lift', 'Power Backup', 'Car Parking', '24x7 Security', 'CCTV', 'Gymnasium', 'Fire Safety'],
    },
  },
]

type UnsplashPhoto = {
  id: string
  urls: { regular: string }
  links: { html: string; download_location: string }
  user: { name: string; links: { html: string } }
}

/** One search per distinct query, cached — 30 photos across 10 listings would
 *  otherwise burn the whole hourly quota on searches alone. */
const searchCache = new Map<string, UnsplashPhoto[]>()
const usedPhotoIds = new Set<string>()

async function searchPhotos(query: string): Promise<UnsplashPhoto[]> {
  const cached = searchCache.get(query)
  if (cached) return cached

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape&content_filter=high`
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } })
  if (!res.ok) throw new Error(`Unsplash search "${query}" failed: ${res.status} ${await res.text()}`)

  const { results } = (await res.json()) as { results: UnsplashPhoto[] }
  searchCache.set(query, results)
  return results
}

/** Next unused photos for a query, so no two listings show the same image. */
async function pickPhotos(query: string, count: number): Promise<UnsplashPhoto[]> {
  const results = await searchPhotos(query)
  const fresh = results.filter((p) => !usedPhotoIds.has(p.id)).slice(0, count)
  if (fresh.length < count) {
    throw new Error(`Only ${fresh.length}/${count} unused Unsplash results left for "${query}" — widen the query list.`)
  }
  fresh.forEach((p) => usedPhotoIds.add(p.id))
  return fresh
}

type Credit = {
  propertyId: string
  photoUrl: string
  photographerName: string
  photographerProfileUrl: string
  unsplashPhotoUrl: string
}

/** Downloads a photo and re-hosts it in Supabase, returning the stored URL plus
 *  the attribution Unsplash requires wherever the image is displayed. */
async function rehost(photo: UnsplashPhoto, propertyId: string, order: number): Promise<Credit> {
  // Pinging download_location is an Unsplash API requirement whenever a photo is
  // actually used (as opposed to merely previewed in search results).
  await fetch(`${photo.links.download_location}&client_id=${ACCESS_KEY}`, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
  }).catch(() => {})

  const res = await fetch(photo.urls.regular)
  if (!res.ok) throw new Error(`Download of photo ${photo.id} failed: ${res.status}`)

  const file = new File([await res.arrayBuffer()], `${propertyId}-${order}.jpg`, { type: 'image/jpeg' })
  const photoUrl = await uploadFile(file, 'property-media', `seed/${propertyId}`)

  return {
    propertyId,
    photoUrl,
    photographerName: photo.user.name,
    photographerProfileUrl: `${photo.user.links.html}?${UTM}`,
    unsplashPhotoUrl: `${photo.links.html}?${UTM}`,
  }
}

const CREDITS_PATH = join(__dirname, 'seed-photo-credits.json')

function readCredits(): Credit[] {
  return existsSync(CREDITS_PATH) ? JSON.parse(readFileSync(CREDITS_PATH, 'utf8')) : []
}

/** Merges this run's credits into the file rather than overwriting it — a resumed
 *  run only holds credits for the listings it actually fetched, and the skipped
 *  ones still need attribution. */
function writeCredits(credits: Credit[]) {
  const reseeded = new Set(credits.map((c) => c.propertyId))
  const merged = [...readCredits().filter((c) => !reseeded.has(c.propertyId)), ...credits].sort((a, b) =>
    a.propertyId.localeCompare(b.propertyId)
  )
  writeFileSync(CREDITS_PATH, `${JSON.stringify(merged, null, 2)}\n`)
}

async function main() {
  const seller = await prisma.user.upsert({
    where: { email: SEED_SELLER.email },
    update: {},
    create: {
      email: SEED_SELLER.email,
      name: SEED_SELLER.name,
      role: 'SELLER',
      roles: ['SELLER'],
      // Deliberately not a valid bcrypt hash — nobody should be able to sign in
      // as the placeholder that owns the fake inventory.
      passwordHash: 'seed-account-no-login',
    },
  })

  // Resumable by default: Unsplash's demo tier allows 50 requests/hour, so a run
  // interrupted halfway through must not re-fetch the listings that already
  // landed. `--reset` forces a clean re-seed (photos cascade with the property).
  if (process.argv.includes('--reset')) {
    const { count } = await prisma.property.deleteMany({ where: { id: { startsWith: ID_PREFIX } } })
    if (count) console.log(`--reset: removed ${count} previously seeded listing(s).`)
  }

  const alreadySeeded = new Set(
    (
      await prisma.property.findMany({
        where: { id: { startsWith: ID_PREFIX } },
        select: { id: true, _count: { select: { photos: true } } },
      })
    )
      .filter((p) => p._count.photos >= PHOTOS_PER_LISTING)
      .map((p) => p.id)
  )

  // id → previously uploaded photos, recovered from the credits file.
  const reusable = new Map<string, Credit[]>()
  if (!process.argv.includes('--refresh-photos')) {
    for (const credit of readCredits()) {
      const forId = reusable.get(credit.propertyId) ?? []
      forId.push(credit)
      reusable.set(credit.propertyId, forId)
    }
    for (const [id, forId] of reusable) {
      if (forId.length < PHOTOS_PER_LISTING) reusable.delete(id)
      else forId.length = PHOTOS_PER_LISTING
    }
  }

  const credits: Credit[] = []

  for (const listing of LISTINGS) {
    const id = `${ID_PREFIX}${String(listing.n).padStart(2, '0')}`
    if (alreadySeeded.has(id)) {
      console.log(`· ${id}  already seeded — skipping (pass --reset to rebuild)`)
      continue
    }
    // A partially-seeded row (created, photos incomplete) is rebuilt from scratch.
    await prisma.property.deleteMany({ where: { id } })

    const { possessionDate, ...rest } = listing.data

    await prisma.property.create({
      data: {
        ...rest,
        id,
        sellerId: seller.id,
        status: listing.status,
        plan: listing.plan,
        verifiedAt: listing.status === 'LIVE' && listing.plan !== 'BASIC' ? new Date() : null,
        possessionDate: possessionDate ? new Date(String(possessionDate)) : null,
        viewCount: Math.floor(Math.random() * 180),
      } as never,
    })

    // Photos already uploaded for this id are reused rather than re-fetched: the
    // Supabase objects outlive the property row, so rebuilding a listing (to edit
    // its copy or type) keeps the same imagery and spends no Unsplash quota.
    // --refresh-photos overrides this and pulls a fresh set.
    const existing = reusable.get(id)
    const listingCredits = existing
      ? existing
      : await Promise.all(
          (await pickPhotos(listing.query, PHOTOS_PER_LISTING)).map((photo, order) => rehost(photo, id, order))
        )
    credits.push(...listingCredits)

    await prisma.propertyPhoto.createMany({
      data: listingCredits.map((c, order) => ({ propertyId: id, photoUrl: c.photoUrl, mediaType: 'IMAGE', order })),
    })

    // Flushed per listing, not once at the end: a crash mid-run (a hit rate limit,
    // most likely) would otherwise leave already-seeded photos with no attribution
    // recorded anywhere, and the photo ids needed to rebuild it are gone.
    writeCredits(credits)
    console.log(
      `✓ ${id}  ${String(listing.data.title)} — ${listingCredits.length} photos${existing ? ' (reused)' : ''}`
    )
  }

  writeCredits(credits)

  const seededCount = new Set(credits.map((c) => c.propertyId)).size
  console.log(`\nSeeded ${seededCount} listing(s) with ${credits.length} Unsplash photos this run.`)
  console.log(`Attribution written to ${CREDITS_PATH} — Unsplash requires crediting the`)
  console.log('photographer wherever these images are shown to end users.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
