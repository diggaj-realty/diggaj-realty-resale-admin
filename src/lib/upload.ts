import { createClient } from '@supabase/supabase-js'

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB fallback — covers ID docs, etc.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10 // 10 years, for private buckets

export type UploadBucket = 'property-media' | 'kyc-documents' | 'deal-documents' | 'avatars'

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/**
 * Uploads a File (from FormData) to Supabase Storage and returns a URL suitable
 * for storing directly in a String column (idDocUrl, selfieUrl, photoUrl, docUrl).
 * `property-media` is a public bucket (buyers browse photos/videos freely);
 * `kyc-documents` and `deal-documents` are private — a long-lived signed URL is returned instead.
 */
export async function uploadFile(
  file: File,
  bucket: UploadBucket,
  folder: string,
  maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES
): Promise<string> {
  if (file.size > maxSizeBytes) {
    throw new Error(`File "${file.name}" exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))}MB size limit.`)
  }

  const supabase = supabaseAdmin()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const key = `${folder}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(`Upload to "${bucket}" failed: ${error.message}`)

  if (bucket === 'property-media' || bucket === 'avatars') {
    return supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl
  }

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS)
  if (signError || !data) throw new Error(`Failed to sign URL for "${key}": ${signError?.message ?? 'unknown error'}`)
  return data.signedUrl
}

/**
 * Issues a signed *upload* URL so the browser can PUT the file bytes straight
 * to Supabase Storage, bypassing this server entirely. Needed for the public
 * no-signup submission flow: routing the file through a Vercel Serverless
 * Function (as uploadFile above does) hits Vercel's hard 4.5MB request-body
 * cap regardless of any Next.js config, which silently broke uploads for
 * virtually any real phone photo/video.
 */
export async function createSignedUpload(bucket: UploadBucket, folder: string, fileName: string) {
  const supabase = supabaseAdmin()
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin'
  const key = `${folder}/${crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(key)
  if (error || !data) throw new Error(`Failed to create signed upload URL: ${error?.message ?? 'unknown error'}`)

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl
  return { signedUrl: data.signedUrl, token: data.token, path: data.path, publicUrl }
}
