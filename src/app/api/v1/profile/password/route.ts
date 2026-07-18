import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'

export const POST = withApi(async (req) => {
  const user = await authenticate(req)
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req)

  const currentPassword = String(body.currentPassword || '')
  const newPassword = String(body.newPassword || '')
  if (!currentPassword || !newPassword) throw new ApiError('All fields are required', 400)
  if (newPassword.length < 8) throw new ApiError('New password must be at least 8 characters', 400)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new ApiError('Current password is incorrect', 400)

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  return ok({ ok: true })
})
