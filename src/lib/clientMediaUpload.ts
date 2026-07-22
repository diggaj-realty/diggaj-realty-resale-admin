import { createClient } from '@supabase/supabase-js'
import { requestMediaUploadUrls, attachPropertyMedia } from '@/lib/actions/media'

function supabaseBrowser() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024 // 15MB
const MAX_VIDEO_SIZE_BYTES = 45 * 1024 * 1024 // 45MB (Supabase bucket cap is 50MB)

/**
 * Uploads photos/videos directly from the browser to Supabase Storage (bypassing
 * our own server for the file bytes), then records the resulting URLs on the property.
 *
 * File size limits are checked here (client-side) rather than relying solely on the
 * server action's check: Next.js redacts custom error messages thrown from Server
 * Actions in production, so a thrown validation error there surfaces to the user only
 * as a generic "Server Components render" message instead of the real reason.
 */
export async function uploadPropertyMediaFiles(propertyId: string, photos: File[], videos: File[]) {
  const files = [
    ...photos.map((file) => ({ file, kind: 'IMAGE' as const })),
    ...videos.map((file) => ({ file, kind: 'VIDEO' as const })),
  ]
  if (files.length === 0) return

  for (const { file, kind } of files) {
    const limit = kind === 'VIDEO' ? MAX_VIDEO_SIZE_BYTES : MAX_PHOTO_SIZE_BYTES
    if (file.size > limit) {
      throw new Error(`File "${file.name}" exceeds the ${Math.round(limit / (1024 * 1024))}MB size limit.`)
    }
  }

  const targets = await requestMediaUploadUrls(
    propertyId,
    files.map(({ file, kind }) => ({ name: file.name, size: file.size, kind }))
  )

  const supabase = supabaseBrowser()
  const media: { photoUrl: string; mediaType: 'IMAGE' | 'VIDEO' }[] = []
  for (let i = 0; i < targets.length; i++) {
    const { path, token, kind, publicUrl } = targets[i]
    const { error } = await supabase.storage.from('property-media').uploadToSignedUrl(path, token, files[i].file)
    if (error) throw new Error(`Upload failed for "${files[i].file.name}": ${error.message}`)
    media.push({ photoUrl: publicUrl, mediaType: kind })
  }

  await attachPropertyMedia(propertyId, media)
}
