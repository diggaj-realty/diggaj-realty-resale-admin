import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { userDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  await authenticate(req, ['ADMIN'])
  const { id } = await ctx.params

  const body = await readJson<{ isActive?: boolean }>(req)
  if (typeof body.isActive !== 'boolean') throw new ApiError('isActive (boolean) is required', 400)

  const updated = await prisma.user.update({ where: { id }, data: { isActive: body.isActive } })
  return ok(userDTO(updated))
})
