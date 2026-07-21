import type { Prisma } from '@prisma/client'

/** The filter shape persisted in SavedSearch.filters and accepted from the
 *  browse query string. All fields optional; unknown keys are ignored. */
export interface PropertyFilters {
  q?: string
  type?: string
  minPrice?: number
  maxPrice?: number
  minBhk?: number
  city?: string
}

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
  if (str(raw.q)) out.q = str(raw.q)
  if (str(raw.type)) out.type = str(raw.type)
  if (str(raw.city)) out.city = str(raw.city)
  if (num(raw.minPrice)) out.minPrice = num(raw.minPrice)
  if (num(raw.maxPrice)) out.maxPrice = num(raw.maxPrice)
  if (num(raw.minBhk)) out.minBhk = num(raw.minBhk)
  return out
}

/** Builds the Prisma where-clause for LIVE properties matching the given filters.
 *  Shared by the browse listing and the saved-search alert scan so results stay
 *  consistent between what a buyer saved and what they get alerted about. */
export function buildPropertyWhere(filters: PropertyFilters): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = { status: 'LIVE' }
  if (filters.type) where.type = filters.type
  if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' }
  if (filters.minBhk) where.bhk = { gte: filters.minBhk }
  if (filters.minPrice || filters.maxPrice) {
    where.askingPrice = {
      ...(filters.minPrice ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
    }
  }
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { location: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  return where
}

/** Renders filters back into a browse query string (e.g. for "apply this search"). */
export function filtersToQuery(filters: PropertyFilters): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  return params.toString()
}
