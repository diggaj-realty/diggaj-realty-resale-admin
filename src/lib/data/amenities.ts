import { prisma } from '@/lib/prisma'
import { DEFAULT_AMENITIES } from '@/lib/data/propertyFields'

/** Active amenity names for the listing-form checklist. Falls back to the built-in
 *  default set when the Amenity master hasn't been populated yet, so the form is
 *  never empty on a fresh install. */
export async function getActiveAmenityNames(): Promise<string[]> {
  const rows = await prisma.amenity.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { name: true },
  })
  return rows.length > 0 ? rows.map((r) => r.name) : DEFAULT_AMENITIES
}
