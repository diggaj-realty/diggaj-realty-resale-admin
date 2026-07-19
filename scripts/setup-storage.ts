import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const buckets: Array<{ name: string; public: boolean; fileSizeLimit: string }> = [
    { name: 'property-media', public: true, fileSizeLimit: '50MB' },
    { name: 'kyc-documents', public: false, fileSizeLimit: '20MB' },
    { name: 'deal-documents', public: false, fileSizeLimit: '20MB' },
    { name: 'avatars', public: true, fileSizeLimit: '5MB' },
  ]

  for (const b of buckets) {
    const { error } = await supabase.storage.createBucket(b.name, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
    })
    if (error && !/already exists/i.test(error.message)) {
      console.error(`Failed to create bucket ${b.name}:`, error.message)
      process.exitCode = 1
    } else {
      console.log(`Bucket ready: ${b.name} (public=${b.public})`)
    }
  }
}

main()
