import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'
import type { UserRole } from '@/types'

const ADDABLE_ROLES: UserRole[] = ['BUYER', 'SELLER']

/** Lets an existing BUYER or SELLER account add the other public role to the
 *  same account — e.g. a seller who now wants to buy — instead of requiring a
 *  second signup with a different email. AGENT/BACKEND/ADMIN are provisioned
 *  by an admin and can't be self-added here. */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['BUYER', 'SELLER'])
  const body = await readJson<{ role?: string }>(req)
  const role = String(body.role || '').trim().toUpperCase()

  if (!ADDABLE_ROLES.includes(role as UserRole)) {
    throw new ApiError(`role must be one of: ${ADDABLE_ROLES.join(', ')}`, 400)
  }

  const currentRoles = user.roles.length > 0 ? user.roles : [user.role]
  if (currentRoles.includes(role)) {
    return ok(userDTO(user))
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { roles: [...currentRoles, role] },
  })

  return ok(userDTO(updated))
})
