'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeFilters } from '@/lib/data/propertySearch'
import type { Prisma } from '@prisma/client'

async function requireBuyer() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'BUYER') throw new Error('Unauthorized')
  return session
}

/** Persist the browse filters as a named saved search for the current buyer. */
export async function saveSearch(formData: FormData) {
  const session = await requireBuyer()

  const name = String(formData.get('name') ?? '').trim() || null
  const filters = normalizeFilters({
    q: formData.get('q'),
    type: formData.get('type'),
    city: formData.get('city'),
    minPrice: formData.get('minPrice'),
    maxPrice: formData.get('maxPrice'),
    minBhk: formData.get('minBhk'),
  })
  const alertsEnabled = formData.get('alertsEnabled') !== 'false'

  await prisma.savedSearch.create({
    data: { userId: session.user.id, name, filters: filters as Prisma.InputJsonValue, alertsEnabled },
  })

  revalidatePath('/dashboard/saved-searches')
}

/** Delete a saved search the buyer owns. */
export async function deleteSavedSearch(formData: FormData) {
  const session = await requireBuyer()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  await prisma.savedSearch.deleteMany({ where: { id, userId: session.user.id } })
  revalidatePath('/dashboard/saved-searches')
}

/** Flip alert delivery on/off for a saved search the buyer owns. */
export async function toggleSavedSearchAlerts(formData: FormData) {
  const session = await requireBuyer()
  const id = String(formData.get('id') ?? '')
  const enabled = formData.get('enabled') === 'true'
  if (!id) throw new Error('Missing id')

  await prisma.savedSearch.updateMany({
    where: { id, userId: session.user.id },
    data: { alertsEnabled: enabled },
  })
  revalidatePath('/dashboard/saved-searches')
}
