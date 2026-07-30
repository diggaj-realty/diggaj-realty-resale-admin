import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { formatINR } from '@/lib/format'
import {
  listCostSheets,
  currentCostSheet,
  buyerView,
  saveCostSheetDraft,
  sendCostSheet,
  checkCostSheet,
  costSheetErrorMessage,
  type CostSheetWithLines,
} from '@/lib/data/costSheets'
import { buyerVisibleTotal, costSheetTotal, isEstimateCategory } from '@/lib/costSheetFields'
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp'

/** Serialises a sheet. `forBuyer` drops internal lines and recomputes the total
 *  from what remains — a total that doesn't add up from the visible rows would
 *  invite exactly the questions the sheet exists to answer. */
function costSheetDTO(sheet: CostSheetWithLines, { forBuyer }: { forBuyer: boolean }) {
  const lines = forBuyer ? sheet.lines.filter((l) => l.sharedWithBuyer) : sheet.lines
  return {
    id: sheet.id,
    dealId: sheet.dealId,
    version: sheet.version,
    status: sheet.status,
    sentAt: sheet.sentAt?.toISOString() ?? null,
    acknowledgedAt: sheet.acknowledgedAt?.toISOString() ?? null,
    queriedAt: sheet.queriedAt?.toISOString() ?? null,
    queryNote: sheet.queryNote,
    queriedLineId: sheet.queriedLineId,
    resolvedAt: sheet.resolvedAt?.toISOString() ?? null,
    isQueryOpen: sheet.queriedAt != null && sheet.resolvedAt == null,
    total: forBuyer ? buyerVisibleTotal(sheet.lines) : costSheetTotal(sheet.lines),
    lines: lines.map((l) => ({
      id: l.id,
      label: l.label,
      amount: l.amount,
      category: l.category,
      note: l.note,
      /** Stamp duty and registration move with circle rates and the
       *  sub-registrar office, so clients must present these as estimates. */
      isEstimate: isEstimateCategory(l.category),
      ...(forBuyer ? {} : { sharedWithBuyer: l.sharedWithBuyer }),
    })),
  }
}

/** The deal's cost sheets.
 *
 *  A buyer sees only the sheet that has actually been sent to them, with the
 *  internal lines stripped. Staff see every version and every line. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['BUYER', 'SELLER', 'AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { buyerId: true, sellerId: true, agentId: true },
  })
  if (!deal) throw new ApiError('Deal not found', 404)

  const isStaff = user.role === 'BACKEND' || user.role === 'ADMIN' || deal.agentId === user.id
  if (!isStaff && deal.buyerId !== user.id && deal.sellerId !== user.id) throw new ApiError('Forbidden', 403)

  if (!isStaff) {
    // The seller is party to the deal but not to what the buyer is being charged
    // — brokerage and buyer-side statutory costs are not theirs to see.
    if (deal.buyerId !== user.id) return ok([])
    const visible = buyerView(await currentCostSheet(dealId))
    return ok(visible ? [costSheetDTO(visible, { forBuyer: true })] : [])
  }

  const sheets = await listCostSheets(dealId)
  return ok(sheets.map((s) => costSheetDTO(s, { forBuyer: false })))
})

/** Saves the deal's draft sheet, replacing whatever draft was there.
 *
 *  `send: true` sends it in the same call, which refuses unless the sheet
 *  reconciles with the confirmed agreed price. */
export const POST = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['AGENT', 'BACKEND', 'ADMIN'])
  const { id: dealId } = await ctx.params

  const body = await readJson<{
    lines?: { label?: string; amount?: number; category?: string; note?: string; sharedWithBuyer?: boolean }[]
    send?: boolean
  }>(req)

  const saved = await saveCostSheetDraft({
    dealId,
    lines: (body.lines ?? []).map((l) => ({
      label: String(l.label ?? ''),
      amount: Number(l.amount),
      category: String(l.category ?? ''),
      note: l.note ?? null,
      sharedWithBuyer: l.sharedWithBuyer === true,
    })),
    actorId: user.id,
    actorRole: user.role,
  })
  if ('error' in saved) {
    const { message, status } = costSheetErrorMessage(saved.error)
    throw new ApiError(message, status)
  }

  if (body.send !== true) {
    const check = await checkCostSheet(saved.sheet.id)
    return ok(
      {
        ...costSheetDTO(saved.sheet, { forBuyer: false }),
        // Returned on save so staff see what stands between this draft and
        // sending, rather than discovering it on the attempt.
        blockers: 'error' in check ? [] : check.messages,
      },
      201
    )
  }

  const sent = await sendCostSheet({ sheetId: saved.sheet.id, actorId: user.id, actorRole: user.role })
  if ('error' in sent) {
    const { status } = costSheetErrorMessage(sent.error)
    throw new ApiError(sent.messages?.join(' ') ?? costSheetErrorMessage(sent.error).message, status)
  }

  await notifyUsers([
    {
      userId: sent.buyerId,
      title: 'Cost breakdown shared with you',
      message: `Your full cost breakdown totals ${formatINR(buyerVisibleTotal(sent.sheet.lines))}. Review it and acknowledge, or ask us about any line.`,
      whatsapp: {
        template: WHATSAPP_TEMPLATES.COST_SHEET_SENT,
        variables: [sent.propertyTitle, formatINR(buyerVisibleTotal(sent.sheet.lines))],
      },
    },
  ])

  return ok(costSheetDTO(sent.sheet, { forBuyer: false }), 201)
})
