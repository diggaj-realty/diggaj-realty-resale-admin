import type { Prisma } from '@prisma/client'
import { normalizeCity, FURNISHING, FACING, POSSESSION_STATUS, OWNERSHIP_TYPE } from './propertyFields'

/** The filter shape persisted in SavedSearch.filters and accepted from the
 *  browse query string. All fields optional; unknown keys are ignored. */
export interface PropertyFilters {
  q?: string
  type?: string
  minPrice?: number
  maxPrice?: number
  minBhk?: number
  city?: string
  locality?: string
  pincode?: string
  minBathrooms?: number
  minArea?: number
  maxArea?: number
  furnishing?: string
  facing?: string
  possessionStatus?: string
  maxAgeYears?: number
  parking?: boolean
  ownershipType?: string
  amenities?: string[]
  eliteOnly?: boolean
  /** NoBroker-style "owner listed only" filter — true excludes any property
   *  with an assigned agent (agentId != null), leaving only listings the
   *  seller manages directly. */
  ownerOnly?: boolean
  sort?: string
}

export const SORTS = ['newest', 'price_asc', 'price_desc', 'area_asc', 'area_desc', 'most_viewed'] as const

/** Normalises loosely-typed input (query string or JSON) into PropertyFilters,
 *  dropping empty/invalid values so a saved search stays clean. */
export function normalizeFilters(raw: Record<string, unknown> | null | undefined): PropertyFilters {
  if (!raw) return {}
  const out: PropertyFilters = {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const oneOf = <T extends readonly string[]>(v: unknown, allowed: T): T[number] | undefined => {
    const s = str(v)
    return s && (allowed as readonly string[]).includes(s) ? (s as T[number]) : undefined
  }
  const bool = (v: unknown) => (v === true || v === 'true' || v === '1' || v === 1 ? true : undefined)
  const strArray = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) {
      const clean = v.map((x) => str(x)).filter((x): x is string => !!x)
      return clean.length > 0 ? clean : undefined
    }
    if (typeof v === 'string' && v.trim()) {
      const clean = v.split(',').map((x) => x.trim()).filter(Boolean)
      return clean.length > 0 ? clean : undefined
    }
    return undefined
  }

  if (str(raw.q)) out.q = str(raw.q)
  if (str(raw.type)) out.type = str(raw.type)
  if (str(raw.city)) out.city = str(raw.city)
  if (str(raw.locality)) out.locality = str(raw.locality)
  if (str(raw.pincode)) out.pincode = str(raw.pincode)
  if (num(raw.minPrice)) out.minPrice = num(raw.minPrice)
  if (num(raw.maxPrice)) out.maxPrice = num(raw.maxPrice)
  if (num(raw.minBhk)) out.minBhk = num(raw.minBhk)
  if (num(raw.minBathrooms)) out.minBathrooms = num(raw.minBathrooms)
  if (num(raw.minArea)) out.minArea = num(raw.minArea)
  if (num(raw.maxArea)) out.maxArea = num(raw.maxArea)
  if (oneOf(raw.furnishing, FURNISHING)) out.furnishing = oneOf(raw.furnishing, FURNISHING)
  if (oneOf(raw.facing, FACING)) out.facing = oneOf(raw.facing, FACING)
  if (oneOf(raw.possessionStatus, POSSESSION_STATUS)) out.possessionStatus = oneOf(raw.possessionStatus, POSSESSION_STATUS)
  if (num(raw.maxAgeYears)) out.maxAgeYears = num(raw.maxAgeYears)
  if (bool(raw.parking)) out.parking = true
  if (oneOf(raw.ownershipType, OWNERSHIP_TYPE)) out.ownershipType = oneOf(raw.ownershipType, OWNERSHIP_TYPE)
  if (strArray(raw.amenities)) out.amenities = strArray(raw.amenities)
  if (bool(raw.eliteOnly)) out.eliteOnly = true
  if (bool(raw.ownerOnly)) out.ownerOnly = true
  if (oneOf(raw.sort, SORTS)) out.sort = oneOf(raw.sort, SORTS)

  return out
}

/** Builds the Prisma where-clause for LIVE properties matching the given filters.
 *  Shared by the browse listing and the saved-search alert scan so results stay
 *  consistent between what a buyer saved and what they get alerted about. */
export function buildPropertyWhere(filters: PropertyFilters): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = { status: 'LIVE' }
  if (filters.type) where.type = filters.type
  if (filters.city) where.city = { equals: normalizeCity(filters.city), mode: 'insensitive' }
  if (filters.locality) where.locality = { contains: filters.locality, mode: 'insensitive' }
  if (filters.pincode) where.pincode = filters.pincode
  if (filters.minBhk) where.bhk = { gte: filters.minBhk }
  if (filters.minBathrooms) where.bathrooms = { gte: filters.minBathrooms }
  if (filters.minPrice || filters.maxPrice) {
    where.askingPrice = {
      ...(filters.minPrice ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
    }
  }
  if (filters.minArea || filters.maxArea) {
    where.areaSqft = {
      ...(filters.minArea ? { gte: filters.minArea } : {}),
      ...(filters.maxArea ? { lte: filters.maxArea } : {}),
    }
  }
  if (filters.furnishing) where.furnishing = filters.furnishing
  if (filters.facing) where.facing = filters.facing
  if (filters.possessionStatus) where.possessionStatus = filters.possessionStatus
  if (filters.maxAgeYears != null) where.ageYears = { lte: filters.maxAgeYears }
  if (filters.parking) {
    where.OR = [...(where.OR ?? []), { parkingCovered: { gt: 0 } }, { parkingOpen: { gt: 0 } }]
  }
  if (filters.ownershipType) where.ownershipType = filters.ownershipType
  if (filters.amenities && filters.amenities.length > 0) where.amenities = { hasEvery: filters.amenities }
  if (filters.eliteOnly) where.plan = 'ELITE'
  if (filters.ownerOnly) where.agentId = null
  if (filters.q) {
    const normalizedQ = normalizeCity(filters.q)
    where.OR = [
      ...(where.OR ?? []),
      { title: { contains: filters.q, mode: 'insensitive' } },
      { location: { contains: filters.q, mode: 'insensitive' } },
      { city: { equals: normalizedQ, mode: 'insensitive' } },
    ]
  }
  return where
}

/** Maps a PropertyFilters.sort value to a Prisma orderBy clause. Defaults to newest first. */
export function buildPropertyOrderBy(sort?: string): Prisma.PropertyOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc': return { askingPrice: 'asc' }
    case 'price_desc': return { askingPrice: 'desc' }
    case 'area_asc': return { areaSqft: 'asc' }
    case 'area_desc': return { areaSqft: 'desc' }
    case 'most_viewed': return { viewCount: 'desc' }
    default: return { createdAt: 'desc' }
  }
}

/** Renders filters back into a browse query string (e.g. for "apply this search"). */
export function filtersToQuery(filters: PropertyFilters): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(k, v.join(','))
    } else {
      params.set(k, String(v))
    }
  }
  return params.toString()
}
