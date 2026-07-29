'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { formatINR } from '@/lib/format'
import {
  saveCostSheetDraft,
  sendCostSheet,
  reviseCostSheet,
  resolveCostSheetQuery,
  costSheetErrorMessage,
  type CostLineInput,
} from '@/lib/data/costSheets'
import { buyerVisibleTotal } from '@/lib/costSheetFields'

/** Cost-sheet authoring from the internal dashboard. Buyer-side acknowledgement
 *  and queries go through the public API instead — buyers never reach this UI. */

function revalidateDeal(dealId: string) {
  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
  revalidatePath('/dashboard/deals')
}

/** Lines arrive as parallel indexed fields from the editor's dynamic rows. */
function linesFromFormData(formData: FormData): CostLineInput[] {
  const labels = formData.getAll('lineLabel').map(String)
  const amounts = formData.getAll('lineAmount').map(String)
  const categories = formData.getAll('lineCategory').map(String)
  const notes = formData.getAll('lineNote').map(String)
  // Checkboxes only post when ticked, so visibility travels as an explicit
  // per-row value rather than by position — otherwise unticking row 1 would
  // silently shift row 2's visibility onto it.
  const shared = new Set(formData.getAll('lineShared').map(String))

  return labels.map((label, i) => ({
    label,
    amount: Number(amounts[i] ?? 0),
    category: categories[i] ?? 'CHARGE',
    note: notes[i] ?? null,
    sharedWithBuyer: shared.has(String(i)),
  }))
}

export async function saveCostSheetDraftAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const dealId = String(formData.get('dealId') ?? '')

  const result = await saveCostSheetDraft({
    dealId,
    lines: linesFromFormData(formData),
    actorId: session.user.id,
    actorRole: session.user.role,
  })
  if ('error' in result) throw new Error(costSheetErrorMessage(result.error).message)

  revalidateDeal(dealId)
}

export async function sendCostSheetAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const dealId = String(formData.get('dealId') ?? '')
  const sheetId = String(formData.get('sheetId') ?? '')

  const result = await sendCostSheet({ sheetId, actorId: session.user.id, actorRole: session.user.role })
  if ('error' in result) {
    // Reconciliation failures carry the specific problems — a generic "does not
    // reconcile" would leave staff guessing which number is wrong.
    throw new Error(result.messages?.join(' ') ?? costSheetErrorMessage(result.error).message)
  }

  const total = buyerVisibleTotal(result.sheet.lines)
  await notifyUsers([
    {
      userId: result.buyerId,
      title: 'Cost breakdown shared with you',
      message: `Your full cost breakdown totals ${formatINR(total)}. Review it and acknowledge, or ask us about any line.`,
    },
  ])

  revalidateDeal(dealId)
}

export async function reviseCostSheetAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const dealId = String(formData.get('dealId') ?? '')

  const result = await reviseCostSheet({ dealId, actorId: session.user.id, actorRole: session.user.role })
  if ('error' in result) throw new Error(costSheetErrorMessage(result.error).message)

  revalidateDeal(dealId)
}

export async function resolveCostSheetQueryAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
  const dealId = String(formData.get('dealId') ?? '')
  const sheetId = String(formData.get('sheetId') ?? '')

  const result = await resolveCostSheetQuery({ sheetId, actorId: session.user.id, actorRole: session.user.role })
  if ('error' in result) throw new Error(costSheetErrorMessage(result.error).message)

  const sheet = await prisma.costSheet.findUnique({ where: { id: sheetId }, include: { deal: { select: { buyerId: true } } } })
  if (sheet) {
    await notifyUsers([
      {
        userId: sheet.deal.buyerId,
        title: 'Your cost breakdown query was answered',
        message: 'We have followed up on the line you asked about. Please review the breakdown again.',
      },
    ])
  }

  revalidateDeal(dealId)
}
