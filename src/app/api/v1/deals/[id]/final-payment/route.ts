import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { dealDTO } from '@/lib/api/dto'

export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{
    finalAmount?: number
    finalPaymentDate?: string
    paymentMode?: string
    transactionRef?: string
  }>(req)

  const finalAmount = Number(body.finalAmount)
  const finalPaymentDateRaw = String(body.finalPaymentDate || '')
  const paymentMode = String(body.paymentMode || '')
  const transactionRef = String(body.transactionRef || '').trim()

  if (!finalAmount || finalAmount <= 0) throw new ApiError('A valid finalAmount is required', 400)
  if (!finalPaymentDateRaw) throw new ApiError('finalPaymentDate is required', 400)
  if (!['BANK_TRANSFER', 'CHEQUE', 'OTHER'].includes(paymentMode)) throw new ApiError('Invalid paymentMode', 400)

  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new ApiError('Deal not found', 404)
  if (deal.agentId !== user.id) throw new ApiError('Unauthorized', 403)

  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: {
      finalAmount,
      finalPaymentDate: new Date(finalPaymentDateRaw),
      paymentMode,
      transactionRef: transactionRef || null,
    },
  })

  return ok(dealDTO(updated))
})
