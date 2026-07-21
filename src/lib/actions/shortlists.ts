'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Toggle a property in the current buyer's shortlist. Idempotent per (user, property):
 *  adds if absent, removes if present. Returns the resulting state so the caller
 *  can reflect it without a round-trip. */
export async function toggleShortlist(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) throw new Error('Missing propertyId')

  const existing = await prisma.shortlist.findUnique({
    where: { userId_propertyId: { userId: session.user.id, propertyId } },
  })

  if (existing) {
    await prisma.shortlist.delete({ where: { id: existing.id } })
  } else {
    // Guard against shortlisting a property that doesn't exist / isn't browsable.
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } })
    if (!property) throw new Error('Property not found')
    await prisma.shortlist.create({ data: { userId: session.user.id, propertyId } })
  }

  revalidatePath('/dashboard/browse')
  revalidatePath('/dashboard/shortlist')
  return { shortlisted: !existing }
}
