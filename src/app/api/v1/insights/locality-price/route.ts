import { prisma } from '@/lib/prisma'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { normalizeCity } from '@/lib/data/propertyFields'

/** Current average price/sqft for a city (optionally narrowed to one
 *  locality) — computed live from LIVE listings. Deliberately NOT a "trend"
 *  (up/down N% vs last quarter): there's no price-history/snapshot model in
 *  the schema to compute a real trend against, so this only ever returns a
 *  current snapshot. Public, no auth — same trust level as browsing listings. */
export const GET = withApi(async (req) => {
  const url = new URL(req.url)
  const cityRaw = url.searchParams.get('city')?.trim()
  const locality = url.searchParams.get('locality')?.trim()
  if (!cityRaw) throw new ApiError('city is required', 400)
  const city = normalizeCity(cityRaw)

  const properties = await prisma.property.findMany({
    where: {
      status: 'LIVE',
      city,
      ...(locality ? { locality: { contains: locality, mode: 'insensitive' } } : {}),
    },
    select: { askingPrice: true, areaSqft: true },
  })

  if (properties.length === 0) {
    return ok({ city, locality: locality ?? null, sampleSize: 0, avgPrice: null, avgPricePerSqft: null })
  }

  const avgPrice = properties.reduce((sum, p) => sum + p.askingPrice, 0) / properties.length
  const avgPricePerSqft =
    properties.reduce((sum, p) => sum + p.askingPrice / p.areaSqft, 0) / properties.length

  return ok({
    city,
    locality: locality ?? null,
    sampleSize: properties.length,
    avgPrice: Math.round(avgPrice),
    avgPricePerSqft: Math.round(avgPricePerSqft),
  })
})
