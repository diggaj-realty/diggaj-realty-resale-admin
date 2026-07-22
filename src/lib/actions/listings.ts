'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { uploadFile } from '@/lib/upload'
import { getAppConfig } from '@/lib/actions/appConfig'
import { buildRichPropertyData, richInputFromFormData } from '@/lib/data/propertyFields'
import type { Prisma } from '@prisma/client'

const STAFF_ROLES = ['AGENT', 'ADMIN', 'BACKEND']
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024 // 15MB
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024 // 20MB

async function uploadPropertyMedia(formData: FormData, propertyId: string) {
  const photoFiles = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  const videoFiles = formData.getAll('videos').filter((f): f is File => f instanceof File && f.size > 0)

  const [photoUrls, videoUrls] = await Promise.all([
    Promise.all(photoFiles.map((f) => uploadFile(f, 'property-media', propertyId, MAX_PHOTO_SIZE_BYTES))),
    Promise.all(videoFiles.map((f) => uploadFile(f, 'property-media', propertyId, MAX_VIDEO_SIZE_BYTES))),
  ])

  return [
    ...photoUrls.map((photoUrl) => ({ photoUrl, mediaType: 'IMAGE' as const })),
    ...videoUrls.map((photoUrl) => ({ photoUrl, mediaType: 'VIDEO' as const })),
  ]
}

export async function createListing(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'SELLER' && !STAFF_ROLES.includes(session.user.role))) throw new Error('Unauthorized')

  const isStaff = STAFF_ROLES.includes(session.user.role)
  const isAgent = session.user.role === 'AGENT'

  // Staff (agents, backend ops, admins) act as the seller of record for properties
  // they list themselves — they're internally vetted, not subject to the seller KYC flow.
  if (!isStaff) {
    const kyc = await prisma.sellerKyc.findUnique({ where: { userId: session.user.id } })
    if (kyc?.status !== 'APPROVED') throw new Error('KYC must be approved before creating a listing.')
  }

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

  const { listingApprovalRequired } = await getAppConfig()

  const rich = buildRichPropertyData(richInputFromFormData(formData))

  const property = await prisma.property.create({
    data: {
      ...rich,
      sellerId: session.user.id,
      agentId: isAgent ? session.user.id : null,
      type,
      title,
      description: description || null,
      location,
      areaSqft,
      bhk,
      askingPrice,
      status: listingApprovalRequired ? 'DRAFT' : 'LIVE',
      verifiedAt: listingApprovalRequired ? null : new Date(),
    } as Prisma.PropertyUncheckedCreateInput,
  })

  const media = await uploadPropertyMedia(formData, property.id)
  if (media.length > 0) {
    await prisma.propertyPhoto.createMany({
      data: media.map((m, order) => ({ propertyId: property.id, photoUrl: m.photoUrl, mediaType: m.mediaType, order })),
    })
  }

  if (listingApprovalRequired) {
    const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
    if (backendUsers.length > 0) {
      await notifyUsers(
        backendUsers.map((u) => ({
          userId: u.id,
          title: 'New listing submitted',
          message: `New listing submitted: ${property.title}.`,
        }))
      )
    }
  }

  revalidatePath('/dashboard/listings')
  revalidatePath('/dashboard')
}

export async function updateListing(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const propertyId = String(formData.get('propertyId'))
  const property = await prisma.property.findUnique({ where: { id: propertyId } })
  if (!property) throw new Error('Property not found')

  const owns = property.sellerId === session.user.id || property.agentId === session.user.id
  if (!owns && session.user.role !== 'ADMIN') throw new Error('Unauthorized')

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

  const rich = buildRichPropertyData(richInputFromFormData(formData))

  await prisma.property.update({
    where: { id: propertyId },
    data: {
      ...rich,
      title,
      description: description || null,
      location,
      type,
      areaSqft,
      bhk,
      askingPrice,
    } as Prisma.PropertyUncheckedUpdateInput,
  })

  const media = await uploadPropertyMedia(formData, propertyId)
  if (media.length > 0) {
    const existingCount = await prisma.propertyPhoto.count({ where: { propertyId } })
    await prisma.propertyPhoto.createMany({
      data: media.map((m, i) => ({ propertyId, photoUrl: m.photoUrl, mediaType: m.mediaType, order: existingCount + i })),
    })
  }

  revalidatePath('/dashboard/listings')
  revalidatePath(`/dashboard/listings/${propertyId}`)
  revalidatePath('/dashboard')
}
