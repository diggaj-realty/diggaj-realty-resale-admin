import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ notes?: string }>(req)
  const notes = String(body.notes || '').trim()

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (deal.agentId !== user.id) throw new ApiError('Unauthorized', 403)

  const updated = await prisma.deal.update({ where: { id: dealId }, data: { notes: notes || null } })
  return ok(dealDTO(updated))
})
