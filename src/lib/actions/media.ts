'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024 // 15MB
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
const BUCKET = 'property-media'

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function requirePropertyEditAccess(propertyId: string) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const property = await prisma.property.findUnique({ where: { id: propertyId } })
  if (!property) throw new Error('Property not found')

  const owns = property.sellerId === session.user.id || property.agentId === session.user.id
  const staffEdit = session.user.role === 'ADMIN' || session.user.role === 'BACKEND'
  if (!owns && !staffEdit) throw new Error('Unauthorized')

  return property
}

/**
 * Media bytes go straight from the browser to Supabase Storage via a signed
 * upload URL — they never transit our own server, so they aren't subject to
 * the platform's request body size cap (which is far smaller than a 20MB video).
 */
export async function requestMediaUploadUrls(
  propertyId: string,
  files: { name: string; size: number; kind: 'IMAGE' | 'VIDEO' }[]
) {
  await requirePropertyEditAccess(propertyId)

  const supabase = supabaseAdmin()
  const targets = []
  for (const f of files) {
    const limit = f.kind === 'VIDEO' ? MAX_VIDEO_SIZE_BYTES : MAX_PHOTO_SIZE_BYTES
    if (f.size > limit) {
      throw new Error(`File "${f.name}" exceeds the ${Math.round(limit / (1024 * 1024))}MB size limit.`)
    }

    const ext = f.name.includes('.') ? f.name.split('.').pop() : 'bin'
    const path = `${propertyId}/${crypto.randomUUID()}.${ext}`
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(`Failed to prepare upload for "${f.name}": ${error?.message ?? 'unknown error'}`)

    targets.push({
      path,
      token: data.token,
      kind: f.kind,
      publicUrl: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    })
  }
  return targets
}

export async function attachPropertyMedia(
  propertyId: string,
  media: { photoUrl: string; mediaType: 'IMAGE' | 'VIDEO' }[]
) {
  await requirePropertyEditAccess(propertyId)
  if (media.length === 0) return

  const existingCount = await prisma.propertyPhoto.count({ where: { propertyId } })
  await prisma.propertyPhoto.createMany({
    data: media.map((m, i) => ({ propertyId, photoUrl: m.photoUrl, mediaType: m.mediaType, order: existingCount + i })),
  })

  revalidatePath('/dashboard/listings')
  revalidatePath(`/dashboard/listings/${propertyId}`)
  revalidatePath('/dashboard')
}

export async function deletePropertyMedia(photoId: string) {
  const photo = await prisma.propertyPhoto.findUnique({ where: { id: photoId } })
  if (!photo) throw new Error('Media not found')
  await requirePropertyEditAccess(photo.propertyId)

  const marker = `/object/public/${BUCKET}/`
  const idx = photo.photoUrl.indexOf(marker)
  if (idx !== -1) {
    const path = photo.photoUrl.slice(idx + marker.length)
    await supabaseAdmin().storage.from(BUCKET).remove([path])
  }

  await prisma.propertyPhoto.delete({ where: { id: photoId } })

  revalidatePath('/dashboard/listings')
  revalidatePath(`/dashboard/listings/${photo.propertyId}`)
  revalidatePath('/dashboard')
}
