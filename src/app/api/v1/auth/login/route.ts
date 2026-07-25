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

  // Every role can get a bearer token here now — AGENT/BACKEND/ADMIN normally
  // work through the internal dashboard's session cookie, but the many
  // role-gated /api/v1 routes built for them (negotiations, kyc/queue,
  // users, deals/assign-agent, etc.) are otherwise unreachable dead ends
  // without this. PENDING accounts are always isActive: false, so the check
  // above already keeps them out without needing a role check here too.
  const token = signApiToken({ id: user.id, role: user.role as UserRole })

  return ok({ token, user: userDTO(user) })
})
