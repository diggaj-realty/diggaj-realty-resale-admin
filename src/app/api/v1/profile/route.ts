import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'

export const PATCH = withApi(async (req) => {
  const user = await authenticate(req)
  const body = await readJson<{ name?: string; phone?: string }>(req)

  const name = String(body.name || '').trim()
  const phone = String(body.phone || '').trim()
  if (!name) throw new ApiError('Name is required', 400)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name, phone: phone || null },
  })

  return ok(userDTO(updated))
})
