import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { createSignedUpload } from '@/lib/upload'

// Loose "submission token" the browser generates once per form load (crypto.randomUUID()) so
// every file from one session lands under the same storage folder. Not a security boundary —
// just groups files; the property itself is only ever LIVE after a human review.
const FOLDER_PATTERN = /^[a-z0-9-]{8,64}$/i

/** Issues a signed Supabase Storage upload URL for the public "submit your property"
 *  intake form — the browser PUTs the file straight to Storage with it, never through
 *  this route. Sending the file itself through a Vercel Serverless Function hits
 *  Vercel's hard 4.5MB request-body cap (independent of any Next.js config), which
 *  silently broke uploads for virtually any real phone photo/video. Deliberately
 *  narrower than the authenticated /uploads flow: only the public property-media
 *  bucket, and only image/video content types, so this can't be used to host
 *  arbitrary files. */
export const POST = withApi(async (req) => {
  const body = await readJson<{ fileName?: string; contentType?: string; folder?: string }>(req)
  const fileName = String(body.fileName || '').trim()
  const contentType = String(body.contentType || '')
  const folder = String(body.folder || '')

  if (!fileName) throw new ApiError('fileName is required', 400)
  if (!FOLDER_PATTERN.test(folder)) throw new ApiError('Invalid folder token', 400)
  if (!/^image\/|^video\//.test(contentType)) throw new ApiError('Only image or video files are allowed', 400)

  const target = await createSignedUpload('property-media', `public-submissions/${folder}`, fileName)
  return ok(target)
})
