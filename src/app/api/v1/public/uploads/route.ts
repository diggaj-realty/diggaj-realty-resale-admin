import { ok, withApi, ApiError } from '@/lib/api/http'
import { uploadFile } from '@/lib/upload'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB, matches the authenticated /uploads limit
// Loose "submission token" the browser generates once per form load (crypto.randomUUID()) so
// every file from one session lands under the same storage folder. Not a security boundary —
// just groups files; the property itself is only ever LIVE after a human review.
const FOLDER_PATTERN = /^[a-z0-9-]{8,64}$/i

/** Unauthenticated file upload for the public "submit your property" intake form.
 *  Deliberately narrower than POST /uploads: only the public property-media bucket,
 *  and only image/video content types, so this can't be used to host arbitrary files. */
export const POST = withApi(async (req) => {
  const form = await req.formData()
  const file = form.get('file')
  const folder = String(form.get('folder') || '')

  if (!(file instanceof File) || file.size === 0) throw new ApiError('A file is required', 400)
  if (!FOLDER_PATTERN.test(folder)) throw new ApiError('Invalid folder token', 400)
  if (!/^image\/|^video\//.test(file.type)) throw new ApiError('Only image or video files are allowed', 400)

  const url = await uploadFile(file, 'property-media', `public-submissions/${folder}`, MAX_FILE_SIZE_BYTES)
  return ok({ url })
})
