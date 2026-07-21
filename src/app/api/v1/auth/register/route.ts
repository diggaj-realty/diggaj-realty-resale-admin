import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signApiToken } from '@/lib/api/jwt'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'
import type { UserRole } from '@/types'

/** Self-serve signup for the public-facing frontend. Only BUYER and SELLER
 *  accounts can be created this way — AGENT/BACKEND/ADMIN are internal roles
 *  provisioned separately. Returns a token immediately so the frontend can
 *  log the user in without a second round trip. */
const PUBLIC_ROLES: UserRole[] = ['BUYER', 'SELLER']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const POST = withApi(async (req) => {
  const body = await readJson<{ name?: string; email?: string; password?: string; phone?: string; role?: string }>(req)

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const phone = body.phone ? String(body.phone).trim() : null
  const role = String(body.role || 'BUYER').trim().toUpperCase()

  if (!name) throw new ApiError('name is required', 400)
  if (!EMAIL_RE.test(email)) throw new ApiError('A valid email is required', 400)
  if (password.length < 8) throw new ApiError('password must be at least 8 characters', 400)
  if (!PUBLIC_ROLES.includes(role as UserRole)) {
    throw new ApiError(`role must be one of: ${PUBLIC_ROLES.join(', ')}`, 400)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ApiError('An account with this email already exists', 409)

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role },
  })

  const token = signApiToken({ id: user.id, role: user.role as UserRole })

  return ok({ token, user: userDTO(user) }, 201)
})
