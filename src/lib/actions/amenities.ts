'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function createAmenity(formData: FormData) {
  await requireAdmin()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Name is required')
  const category = String(formData.get('category') ?? '').trim() || null

  const existing = await prisma.amenity.findUnique({ where: { name } })
  if (existing) throw new Error('Amenity already exists')

  await prisma.amenity.create({ data: { name, category } })
  revalidatePath('/dashboard/amenities')
}

export async function toggleAmenity(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const active = formData.get('active') === 'true'
  if (!id) throw new Error('Missing id')
  await prisma.amenity.update({ where: { id }, data: { active } })
  revalidatePath('/dashboard/amenities')
}

export async function deleteAmenity(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  await prisma.amenity.deleteMany({ where: { id } })
  revalidatePath('/dashboard/amenities')
}
