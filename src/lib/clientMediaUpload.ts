import { createClient } from '@supabase/supabase-js'
import { requestMediaUploadUrls, attachPropertyMedia } from '@/lib/actions/media'

function supabaseBrowser() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

/**
 * Uploads photos/videos directly from the browser to Supabase Storage (bypassing
 * our own server for the file bytes), then records the resulting URLs on the property.
 */
export async function uploadPropertyMediaFiles(propertyId: string, photos: File[], videos: File[]) {
  const files = [
    ...photos.map((file) => ({ file, kind: 'IMAGE' as const })),
    ...videos.map((file) => ({ file, kind: 'VIDEO' as const })),
  ]
  if (files.length === 0) return

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
