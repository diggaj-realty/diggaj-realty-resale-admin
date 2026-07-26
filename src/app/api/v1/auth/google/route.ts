import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signApiToken } from '@/lib/api/jwt'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'
import { hasAnyRole } from '@/lib/api/auth'
import type { UserRole } from '@/types'

const PUBLIC_ROLES: UserRole[] = ['BUYER', 'SELLER']

interface GoogleTokenInfo {
  aud: string
  email?: string
  email_verified?: string
  name?: string
  picture?: string
}

/** Verifies a Google ID token (from Google Identity Services on the frontend)
 *  server-side via Google's own tokeninfo endpoint — no extra dependency, and
 *  no risk of trusting an unverified client-supplied email/name. */
async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  if (!res.ok) throw new ApiError('Invalid or expired Google token', 401)
  const data = (await res.json()) as GoogleTokenInfo

  if (!process.env.GOOGLE_CLIENT_ID || data.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new ApiError('Google token was not issued for this app', 401)
  }
  if (data.email_verified !== 'true') throw new ApiError('Google email is not verified', 401)
  if (!data.email) throw new ApiError('Google account has no email', 401)

  return data
}

/** Sign in (or self-serve register) a BUYER/SELLER via Google — the public-API
 *  equivalent of /auth/register + /auth/login combined. The frontend gets an
 *  ID token from Google Identity Services, sends it here, and gets back the
 *  same bearer-token shape as every other public-API auth route. */
export const POST = withApi(async (req) => {
  const body = await readJson<{ idToken?: string; role?: string; phone?: string }>(req)
  const idToken = String(body.idToken || '')
  if (!idToken) throw new ApiError('idToken is required', 400)

  const google = await verifyGoogleIdToken(idToken)
  const email = google.email!.toLowerCase()
  const requestedRole = String(body.role || 'BUYER').trim().toUpperCase()
  if (!PUBLIC_ROLES.includes(requestedRole as UserRole)) {
    throw new ApiError(`role must be one of: ${PUBLIC_ROLES.join(', ')}`, 400)
  }

  let user = await prisma.user.findUnique({ where: { email } })
  let isNewUser = false

  if (user) {
    if (!hasAnyRole(user, ['BUYER', 'SELLER'])) {
      throw new ApiError('This email is registered as internal staff — sign in through the internal dashboard instead.', 409)
    }
    if (!user.isActive) throw new ApiError('This account has been deactivated', 403)
    if (!hasAnyRole(user, [requestedRole as UserRole])) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { roles: { push: requestedRole } },
      })
    }
  } else {
    isNewUser = true
    user = await prisma.user.create({
      data: {
        name: google.name || email.split('@')[0],
        email,
        phone: body.phone ? String(body.phone).trim() : null,
        passwordHash: await bcrypt.hash(crypto.randomUUID(), 10), // Google-only account — no password login
        role: requestedRole,
        roles: [requestedRole],
        avatarUrl: google.picture ?? null,
      },
    })
  }

  const token = signApiToken({ id: user.id, role: user.role as UserRole })
  return ok({ token, user: userDTO(user), isNewUser }, isNewUser ? 201 : 200)
})
