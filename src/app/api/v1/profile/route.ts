import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'
import { toStoredPhone, PHONE_ERROR } from '@/lib/phone'

export const PATCH = withApi(async (req) => {
  const user = await authenticate(req)
  const body = await readJson<{ name?: string; phone?: string }>(req)

  const name = String(body.name || '').trim()
  const phoneRaw = String(body.phone || '').trim()
  if (!name) throw new ApiError('Name is required', 400)

  // Clearing the number is allowed; supplying a broken one is not — silently
  // storing "98800" would leave an agent with an unreachable lead.
  const phone = phoneRaw ? toStoredPhone(phoneRaw) : null
  if (phoneRaw && !phone) throw new ApiError(PHONE_ERROR, 400)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name, phone },
  })

  return ok(userDTO(updated))
})
