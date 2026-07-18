import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{ tokenAmount?: number; tokenDate?: string }>(req)
  const tokenAmount = Number(body.tokenAmount)
  const tokenDateRaw = String(body.tokenDate || '')
  if (!tokenAmount || tokenAmount <= 0) throw new ApiError('A valid tokenAmount is required', 400)
  if (!tokenDateRaw) throw new ApiError('tokenDate is required', 400)

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (deal.agentId !== user.id) throw new ApiError('Unauthorized', 403)

  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: { tokenAmount, tokenDate: new Date(tokenDateRaw) },
  })

  return ok(dealDTO(updated))
})
