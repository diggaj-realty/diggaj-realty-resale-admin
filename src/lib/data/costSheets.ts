import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { currentOfflineNegotiation } from '@/lib/data/offlineNegotiation'
import {
  reconcileCostSheet,
  reconcileProblemMessage,
  isCostLineCategory,
  type ReconcileProblem,
} from '@/lib/costSheetFields'
import type { CostSheet, CostSheetLine } from '@prisma/client'

/** Telling the buyer what they actually pay, and why.
 *
 *  Structured line items rather than an uploaded PDF: the buyer can query one
 *  line instead of the whole document, the property-price line is checked against
 *  the confirmed negotiated amount rather than quietly disagreeing with it, and
 *  the numbers stay reportable. The formal signed copy can still be attached as a
 *  DealDocument alongside.
 *
 *  Authored by the deal's own agent or by backend — agents know a project's
 *  charges, backend runs the desk, and both need to see the same sheet.
 */

export type CostSheetError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'DEAL_FINISHED'
  | 'NOT_DRAFT'
  | 'NOT_SENT'
  | 'ALREADY_ACKNOWLEDGED'
  | 'INVALID_LINE'
  | 'RECONCILE_FAILED'
  | 'NOT_QUERIED'

export type CostSheetWithLines = CostSheet & { lines: CostSheetLine[] }

export interface CostLineInput {
  label: string
  amount: number
  category: string
  note?: string | null
  sharedWithBuyer?: boolean
}

/** Staff who may author a sheet on this deal: its assigned agent, or backend/admin. */
function canAuthor(deal: { agentId: string | null }, actorId: string, actorRole: string) {
  if (actorRole === 'BACKEND' || actorRole === 'ADMIN') return true
  return actorRole === 'AGENT' && deal.agentId === actorId
}

/** The confirmed agreed price, or null if both sides haven't signed off on a
 *  figure. Falls back to nothing rather than to Deal.agreedPrice on purpose:
 *  agreedPrice may still hold the original accepted offer, and reconciling
 *  against a stale number would defeat the check. */
async function confirmedAgreedAmount(dealId: string): Promise<number | null> {
  const live = await currentOfflineNegotiation(dealId)
  if (live && live.buyerConfirmed && live.sellerConfirmed) return live.agreedAmount
  // No offline negotiation at all means the price came from an accepted offer,
  // which both parties did transact on — that is a legitimate agreed figure.
  if (!live) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { agreedPrice: true } })
    return deal?.agreedPrice ?? null
  }
  return null
}

/** Sheets on a deal, newest version first. */
export async function listCostSheets(dealId: string): Promise<CostSheetWithLines[]> {
  return prisma.costSheet.findMany({
    where: { dealId },
    orderBy: { version: 'desc' },
    include: { lines: { orderBy: { order: 'asc' } } },
  })
}

/** The sheet that currently stands — the sent one, or the draft being prepared. */
export async function currentCostSheet(dealId: string): Promise<CostSheetWithLines | null> {
  return prisma.costSheet.findFirst({
    where: { dealId, status: { in: ['DRAFT', 'SENT'] } },
    orderBy: { version: 'desc' },
    include: { lines: { orderBy: { order: 'asc' } } },
  })
}

/** What the buyer is allowed to see: shared lines only, and only once sent.
 *
 *  Internal lines are dropped rather than masked, and the total is recomputed
 *  from what remains — a total that doesn't add up from the visible rows would
 *  invite exactly the questions the sheet exists to answer. */
export function buyerView(sheet: CostSheetWithLines | null) {
  if (!sheet || sheet.status === 'DRAFT') return null
  return { ...sheet, lines: sheet.lines.filter((l) => l.sharedWithBuyer) }
}

function validateLines(lines: CostLineInput[]): { error: 'INVALID_LINE' } | { lines: CostLineInput[] } {
  const clean: CostLineInput[] = []
  for (const l of lines) {
    const label = String(l.label ?? '').trim()
    const amount = Number(l.amount)
    if (!label) return { error: 'INVALID_LINE' }
    if (!Number.isFinite(amount) || amount < 0) return { error: 'INVALID_LINE' }
    if (!isCostLineCategory(String(l.category))) return { error: 'INVALID_LINE' }
    clean.push({
      label,
      amount,
      category: String(l.category),
      note: l.note ? String(l.note).trim() || null : null,
      // Defaults to internal when unspecified, matching the column default:
      // brokerage sits on the same sheet as the buyer's charges, and a default
      // of "shared" would leak it the first time someone forgot to untick.
      sharedWithBuyer: l.sharedWithBuyer === true,
    })
  }
  return { lines: clean }
}

/** Creates or replaces the deal's draft sheet.
 *
 *  A DRAFT is freely rewritable — it hasn't been shown to anyone. A SENT sheet is
 *  never mutated; `sendCostSheet`'s counterpart `reviseCostSheet` supersedes it
 *  with a new version instead.
 */
export async function saveCostSheetDraft({
  dealId,
  lines,
  actorId,
  actorRole,
}: {
  dealId: string
  lines: CostLineInput[]
  actorId: string
  actorRole: string
}): Promise<{ error: CostSheetError } | { sheet: CostSheetWithLines }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, agentId: true, status: true } })
  if (!deal) return { error: 'NOT_FOUND' }
  if (!canAuthor(deal, actorId, actorRole)) return { error: 'FORBIDDEN' }
  if (deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' }

  const validated = validateLines(lines)
  if ('error' in validated) return { error: validated.error }

  const existingDraft = await prisma.costSheet.findFirst({
    where: { dealId, status: 'DRAFT' },
    orderBy: { version: 'desc' },
  })
  const highest = await prisma.costSheet.findFirst({
    where: { dealId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  const sheet = await prisma.$transaction(async (tx) => {
    const target = existingDraft
      ? await tx.costSheet.update({ where: { id: existingDraft.id }, data: { authorId: actorId } })
      : await tx.costSheet.create({
          data: { dealId, version: (highest?.version ?? 0) + 1, status: 'DRAFT', authorId: actorId },
        })

    await tx.costSheetLine.deleteMany({ where: { costSheetId: target.id } })
    await tx.costSheetLine.createMany({
      data: validated.lines.map((l, order) => ({
        costSheetId: target.id,
        label: l.label,
        amount: l.amount,
        category: l.category,
        note: l.note ?? null,
        sharedWithBuyer: l.sharedWithBuyer === true,
        order,
      })),
    })

    return tx.costSheet.findUniqueOrThrow({
      where: { id: target.id },
      include: { lines: { orderBy: { order: 'asc' } } },
    })
  })

  return { sheet }
}

/** Checks a draft against the confirmed price without sending it, so staff see
 *  the problems while editing rather than on the attempt to send. */
export async function checkCostSheet(sheetId: string): Promise<
  { error: 'NOT_FOUND' } | { problems: ReconcileProblem[]; messages: string[]; agreedAmount: number | null }
> {
  const sheet = await prisma.costSheet.findUnique({ where: { id: sheetId }, include: { lines: true } })
  if (!sheet) return { error: 'NOT_FOUND' }

  const agreedAmount = await confirmedAgreedAmount(sheet.dealId)
  const problems = reconcileCostSheet({ lines: sheet.lines, agreedAmount })
  return { problems, messages: problems.map(reconcileProblemMessage), agreedAmount }
}

/** Sends the sheet to the buyer, freezing it.
 *
 *  Refuses if it doesn't reconcile. A breakdown that disagrees with the deal's
 *  own agreed price is worse than no breakdown — it looks authoritative and
 *  isn't.
 */
export async function sendCostSheet({
  sheetId,
  actorId,
  actorRole,
}: {
  sheetId: string
  actorId: string
  actorRole: string
}): Promise<
  | { error: CostSheetError; messages?: string[] }
  | { sheet: CostSheetWithLines; dealId: string; buyerId: string; propertyTitle: string }
> {
  const sheet = await prisma.costSheet.findUnique({
    where: { id: sheetId },
    include: {
      lines: true,
      deal: { select: { id: true, agentId: true, status: true, buyerId: true, property: { select: { title: true } } } },
    },
  })
  if (!sheet) return { error: 'NOT_FOUND' }
  if (!canAuthor(sheet.deal, actorId, actorRole)) return { error: 'FORBIDDEN' }
  if (sheet.deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' }
  if (sheet.status !== 'DRAFT') return { error: 'NOT_DRAFT' }

  const agreedAmount = await confirmedAgreedAmount(sheet.dealId)
  const problems = reconcileCostSheet({ lines: sheet.lines, agreedAmount })
  if (problems.length > 0) {
    return { error: 'RECONCILE_FAILED', messages: problems.map(reconcileProblemMessage) }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Any earlier sent sheet is superseded — only one sheet stands at a time.
    await tx.costSheet.updateMany({
      where: { dealId: sheet.dealId, status: 'SENT', id: { not: sheetId } },
      data: { status: 'SUPERSEDED' },
    })

    const next = await tx.costSheet.update({
      where: { id: sheetId },
      data: { status: 'SENT', sentAt: new Date(), authorId: actorId },
      include: { lines: { orderBy: { order: 'asc' } } },
    })

    await recordAudit(
      {
        action: 'COST_SHEET_SENT',
        actorId,
        entity: 'CostSheet',
        entityId: sheetId,
        meta: { dealId: sheet.dealId, version: sheet.version, lineCount: sheet.lines.length, by: actorRole },
      },
      tx
    )

    return next
  })

  return {
    sheet: updated,
    dealId: sheet.dealId,
    buyerId: sheet.deal.buyerId,
    propertyTitle: sheet.deal.property.title,
  }
}

/** Opens a new draft from the sent sheet, so it can be corrected.
 *
 *  The sent version is left untouched until the revision is itself sent. A figure
 *  the buyer has already acknowledged must never change underneath them — if it
 *  needs to change, that is a new version they acknowledge again.
 */
export async function reviseCostSheet({
  dealId,
  actorId,
  actorRole,
}: {
  dealId: string
  actorId: string
  actorRole: string
}): Promise<{ error: CostSheetError } | { sheet: CostSheetWithLines }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, agentId: true, status: true } })
  if (!deal) return { error: 'NOT_FOUND' }
  if (!canAuthor(deal, actorId, actorRole)) return { error: 'FORBIDDEN' }
  if (deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' }

  const existingDraft = await prisma.costSheet.findFirst({ where: { dealId, status: 'DRAFT' } })
  if (existingDraft) {
    return {
      sheet: await prisma.costSheet.findUniqueOrThrow({
        where: { id: existingDraft.id },
        include: { lines: { orderBy: { order: 'asc' } } },
      }),
    }
  }

  const sent = await prisma.costSheet.findFirst({
    where: { dealId, status: 'SENT' },
    orderBy: { version: 'desc' },
    include: { lines: { orderBy: { order: 'asc' } } },
  })
  if (!sent) return { error: 'NOT_SENT' }

  const sheet = await prisma.$transaction(async (tx) => {
    const created = await tx.costSheet.create({
      data: { dealId, version: sent.version + 1, status: 'DRAFT', authorId: actorId },
    })
    await tx.costSheetLine.createMany({
      data: sent.lines.map((l, order) => ({
        costSheetId: created.id,
        label: l.label,
        amount: l.amount,
        category: l.category,
        note: l.note,
        sharedWithBuyer: l.sharedWithBuyer,
        order,
      })),
    })
    return tx.costSheet.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: { orderBy: { order: 'asc' } } },
    })
  })

  return { sheet }
}

/** Buyer acknowledging the sheet, or querying one line of it.
 *
 *  Restricted to the deal's buyer — the same rule as confirming a negotiated
 *  price, and for the same reason. A query names the line, so staff get "what is
 *  the club membership for?" rather than an unattributable complaint.
 */
export async function respondToCostSheet({
  sheetId,
  action,
  lineId,
  note,
  actorId,
}: {
  sheetId: string
  action: 'acknowledge' | 'query'
  lineId?: string | null
  note?: string | null
  actorId: string
}): Promise<{ error: CostSheetError } | { sheet: CostSheet; dealId: string; agentId: string | null; lineLabel: string | null }> {
  const sheet = await prisma.costSheet.findUnique({
    where: { id: sheetId },
    include: { lines: true, deal: { select: { id: true, buyerId: true, agentId: true, status: true } } },
  })
  if (!sheet) return { error: 'NOT_FOUND' }
  if (sheet.deal.buyerId !== actorId) return { error: 'FORBIDDEN' }
  if (sheet.status !== 'SENT') return { error: 'NOT_SENT' }

  if (action === 'acknowledge') {
    if (sheet.acknowledgedAt) return { error: 'ALREADY_ACKNOWLEDGED' }
    const updated = await prisma.costSheet.update({
      where: { id: sheetId },
      // Acknowledging settles any query the buyer had raised on this sheet.
      data: { acknowledgedAt: new Date(), ...(sheet.queriedAt && !sheet.resolvedAt ? { resolvedAt: new Date() } : {}) },
    })
    await recordAudit({
      action: 'COST_SHEET_ACKNOWLEDGED',
      actorId,
      entity: 'CostSheet',
      entityId: sheetId,
      meta: { dealId: sheet.dealId, version: sheet.version },
    })
    return { sheet: updated, dealId: sheet.dealId, agentId: sheet.deal.agentId, lineLabel: null }
  }

  const line = lineId ? sheet.lines.find((l) => l.id === lineId) : null
  // A query naming a line the buyer cannot see is not a real query.
  if (lineId && (!line || !line.sharedWithBuyer)) return { error: 'INVALID_LINE' }

  const updated = await prisma.costSheet.update({
    where: { id: sheetId },
    data: {
      queriedAt: new Date(),
      queryNote: note?.trim() || null,
      queriedLineId: line?.id ?? null,
      resolvedAt: null,
      // A buyer questioning the breakdown has plainly not accepted it.
      acknowledgedAt: null,
    },
  })
  await recordAudit({
    action: 'COST_SHEET_QUERIED',
    actorId,
    entity: 'CostSheet',
    entityId: sheetId,
    meta: { dealId: sheet.dealId, version: sheet.version, lineId: line?.id ?? null, lineLabel: line?.label ?? null, note: note?.trim() || null },
  })

  return { sheet: updated, dealId: sheet.dealId, agentId: sheet.deal.agentId, lineLabel: line?.label ?? null }
}

/** Staff closing out a query after speaking to the buyer, without revising the
 *  sheet. The buyer still has to acknowledge. */
export async function resolveCostSheetQuery({
  sheetId,
  actorId,
  actorRole,
}: {
  sheetId: string
  actorId: string
  actorRole: string
}): Promise<{ error: CostSheetError } | { sheet: CostSheet }> {
  const sheet = await prisma.costSheet.findUnique({
    where: { id: sheetId },
    include: { deal: { select: { agentId: true } } },
  })
  if (!sheet) return { error: 'NOT_FOUND' }
  if (!canAuthor(sheet.deal, actorId, actorRole)) return { error: 'FORBIDDEN' }
  if (!sheet.queriedAt || sheet.resolvedAt) return { error: 'NOT_QUERIED' }

  const updated = await prisma.costSheet.update({ where: { id: sheetId }, data: { resolvedAt: new Date() } })
  await recordAudit({
    action: 'COST_SHEET_QUERY_RESOLVED',
    actorId,
    entity: 'CostSheet',
    entityId: sheetId,
    meta: { dealId: sheet.dealId, version: sheet.version, by: actorRole },
  })
  return { sheet: updated }
}

/** Whether a sheet has an unresolved query. Consulted by the stage control for
 *  the same reason a disputed price is: the buyer is asking what they are paying,
 *  and paperwork should not advance past an unanswered question about it. */
export async function hasOpenCostSheetQuery(dealId: string): Promise<boolean> {
  const open = await prisma.costSheet.findFirst({
    where: { dealId, status: 'SENT', queriedAt: { not: null }, resolvedAt: null },
    select: { id: true },
  })
  return open != null
}

export function costSheetErrorMessage(error: CostSheetError): { message: string; status: number } {
  switch (error) {
    case 'NOT_FOUND':
      return { message: 'Cost sheet not found', status: 404 }
    case 'FORBIDDEN':
      return { message: 'You cannot act on this deal’s cost sheet', status: 403 }
    case 'DEAL_FINISHED':
      return { message: 'This deal is finished', status: 409 }
    case 'NOT_DRAFT':
      return { message: 'This sheet has already been sent — revise it to make changes', status: 409 }
    case 'NOT_SENT':
      return { message: 'No sent cost sheet on this deal', status: 409 }
    case 'ALREADY_ACKNOWLEDGED':
      return { message: 'You have already acknowledged this sheet', status: 409 }
    case 'INVALID_LINE':
      return { message: 'Every line needs a label, a valid amount and a known category', status: 400 }
    case 'RECONCILE_FAILED':
      return { message: 'This sheet does not reconcile with the agreed price', status: 409 }
    case 'NOT_QUERIED':
      return { message: 'There is no open query on this sheet', status: 409 }
  }
}
