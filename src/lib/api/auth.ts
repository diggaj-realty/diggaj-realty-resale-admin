import { prisma } from '@/lib/prisma'
import { verifyApiToken } from '@/lib/api/jwt'
import { ApiError } from '@/lib/api/http'
import type { UserRole } from '@/types'
import type { User } from '@prisma/client'

/** Authenticates a request via `Authorization: Bearer <token>`. Re-fetches the
 *  user from the DB on every call (rather than trusting the JWT claims) so a
 *  deactivated account or role change takes effect immediately, not after 30 days. */
export async function authenticate(req: Request, allowedRoles?: UserRole[]): Promise<User> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) throw new ApiError('Missing bearer token', 401)

  const payload = verifyApiToken(token)
  if (!payload) throw new ApiError('Invalid or expired token', 401)

  const user = await prisma.user.findUnique({ where: { id: payload.id } })
  if (!user || !user.isActive) throw new ApiError('Account not found or deactivated', 401)

  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    throw new ApiError(`Forbidden — requires role: ${allowedRoles.join(' or ')}`, 403)
  }

  return user
}

/** For public routes that behave slightly differently for a logged-in caller
 *  (e.g. skipping view-count on the owner's own listing) without requiring
 *  auth. No header → anonymous (returns null). A header with a bad/expired
 *  token still errors — a malformed token shouldn't be silently ignored. */
export async function authenticateOptional(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return null

  const payload = verifyApiToken(token)
  if (!payload) throw new ApiError('Invalid or expired token', 401)

  const user = await prisma.user.findUnique({ where: { id: payload.id } })
  if (!user || !user.isActive) throw new ApiError('Account not found or deactivated', 401)

  return user
}
