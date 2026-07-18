import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import { uploadFile, type UploadBucket } from '@/lib/upload'

const ALLOWED_BUCKETS: UploadBucket[] = ['property-media', 'kyc-documents', 'deal-documents']

/** Generic file upload — the external UI uploads a file first, gets back a URL,
 *  then sends that URL as part of a normal JSON request (e.g. POST /listings). */
export const POST = withApi(async (req) => {
  const user = await authenticate(req)

  const form = await req.formData()
  const file = form.get('file')
  const bucket = String(form.get('bucket') || '')
  const folder = String(form.get('folder') || user.id)

  if (!(file instanceof File) || file.size === 0) throw new ApiError('A file is required', 400)
  if (!ALLOWED_BUCKETS.includes(bucket as UploadBucket)) {
    throw new ApiError(`bucket must be one of: ${ALLOWED_BUCKETS.join(', ')}`, 400)
  }

  const url = await uploadFile(file, bucket as UploadBucket, folder)
  return ok({ url })
})
