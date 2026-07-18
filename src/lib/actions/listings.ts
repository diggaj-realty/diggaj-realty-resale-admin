'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadFile } from '@/lib/upload'

export async function createListing(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'SELLER') throw new Error('Unauthorized')

  const kyc = await prisma.sellerKyc.findUnique({ where: { userId: session.user.id } })
  if (kyc?.status !== 'APPROVED') throw new Error('KYC must be approved before creating a listing.')

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim()
  const type = String(formData.get('type') ?? '')
  const areaSqft = Number(formData.get('areaSqft'))
  const bhkRaw = formData.get('bhk')
  const bhk = type === 'PLOT' || !bhkRaw ? null : Number(bhkRaw)
  const askingPrice = Number(formData.get('askingPrice'))

  if (!title) throw new Error('Title is required.')
  if (!location) throw new Error('Location is required.')
  if (!['RESIDENTIAL', 'PLOT', 'COMMERCIAL'].includes(type)) throw new Error('Invalid property type.')
  if (!areaSqft || areaSqft <= 0) throw new Error('Area (sqft) is required.')
  if (!askingPrice || askingPrice <= 0) throw new Error('Asking price is required.')

  const photoFiles = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)

  const property = await prisma.property.create({
    data: {
      sellerId: session.user.id,
      type,
      title,
      description: description || null,
      location,
      areaSqft,
      bhk,
      askingPrice,
      status: 'DRAFT',
    },
  })

  if (photoFiles.length > 0) {
    const photoUrls = await Promise.all(
      photoFiles.map((f) => uploadFile(f, 'property-media', property.id))
    )
    await prisma.propertyPhoto.createMany({
      data: photoUrls.map((photoUrl, order) => ({ propertyId: property.id, photoUrl, order })),
    })
  }

  const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
  if (backendUsers.length > 0) {
    await prisma.notification.createMany({
      data: backendUsers.map((u) => ({
        userId: u.id,
        title: 'New listing submitted',
        message: `New listing submitted: ${property.title}.`,
      })),
    })
  }

  revalidatePath('/dashboard/listings')
  revalidatePath('/dashboard')
}
