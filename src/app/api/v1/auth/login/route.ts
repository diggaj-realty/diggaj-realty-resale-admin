import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signApiToken } from '@/lib/api/jwt'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'
import type { UserRole } from '@/types'

export const POST = withApi(async (req) => {
  const body = await readJson<{ email?: string; password?: string }>(req)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')

  if (!email || !password) throw new ApiError('Email and password are required', 400)

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) throw new ApiError('Invalid credentials', 401)

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new ApiError('Invalid credentials', 401)

  const token = signApiToken({ id: user.id, role: user.role as UserRole })

  return ok({ token, user: userDTO(user) })
})
