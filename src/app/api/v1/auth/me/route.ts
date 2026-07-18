import { authenticate } from '@/lib/api/auth'
import { ok, withApi } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'

export const GET = withApi(async (req) => {
  const user = await authenticate(req)
  return ok(userDTO(user))
})
