import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import type { OfflineNegotiation as OfflineNegotiationRow } from '@prisma/client'

/** Recording, confirming and disputing a price agreed off-platform.
 *
 *  The rule that shapes this module: staff record *what was agreed*, and the
 *  parties confirm *that they agreed it*. Those used to be the same action — an
 *  agent ticked "buyer confirmed" on the buyer's behalf — which made the strongest
 *  claim in the transaction ("both sides accepted ₹1.7 Cr") an assertion by one
 *  interested party. The online offer flow never allowed that; this now matches it.
 *
 *  Until both sides have confirmed, the figure is a proposal. Only then does it
 *  reach Deal.agreedPrice.
 */

export type NegotiationParty = 'BUYER' | 'SELLER'

type NegotiationRecord = Awaited<ReturnType<typeof currentOfflineNegotiation>>
type DealWithProperty = { id: string; buyerId: string; sellerId: string; agentId: string | null; property: { title: string } }

/** Explicit result unions so `'error' in result` narrows at the call sites —
 *  the inferred union of these functions' many returns does not. */
type Fail = { error: OfflineNegotiationError }
export type RecordResult = Fail | { record: NonNullable<NegotiationRecord>; deal: DealWithProperty }
export type ConfirmResult =
  | Fail
  | { record: OfflineNegotiationRow; deal: DealWithProperty; party: NegotiationParty; bothConfirmed: boolean }
export type DisputeResult =
  | Fail
  | { record: OfflineNegotiationRow; deal: DealWithProperty; party: NegotiationParty }
export type ResolveResult = Fail | { record: OfflineNegotiationRow; deal: { id: string } }

export type OfflineNegotiationError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'SUPERSEDED'
  | 'ALREADY_ACTED'
  | 'DEAL_FINISHED'
  | 'INVALID_AMOUNT'
  | 'NOT_DISPUTED'

/** The live record for a deal — the most recent one that hasn't been superseded. */
export async function currentOfflineNegotiation(dealId: string) {
  return prisma.offlineNegotiation.findFirst({
    where: { dealId, supersededAt: null },
    orderBy: { createdAt: 'desc' },
    include: { recordedBy: { select: { name: true } } },
  })
}

/** Whether a deal has an unresolved dispute about its price.
 *
 *  Consulted by the stage control: paperwork should not advance while one side
 *  says the agreed figure is wrong. */
export async function hasPriceDispute(dealId: string): Promise<boolean> {
  const live = await prisma.offlineNegotiation.findFirst({
    where: { dealId, supersededAt: null, disputedAt: { not: null }, resolvedAt: null },
    select: { id: true },
  })
  return live != null
}

/** Which party this user is on this deal, if any. */
function partyFor(deal: { buyerId: string; sellerId: string }, userId: string): NegotiationParty | null {
  if (deal.buyerId === userId) return 'BUYER'
  if (deal.sellerId === userId) return 'SELLER'
  return null
}

/** Records a newly agreed figure, superseding any earlier one.
 *
 *  Both confirmations start false — including when staff are correcting a figure
 *  the parties had already confirmed. A changed number is a new agreement and
 *  needs agreeing to again; carrying the old ticks forward would silently
 *  attribute consent to a price nobody saw.
 */
export async function recordOfflineNegotiation({
  dealId,
  agreedAmount,
  notes,
  actorId,
  actorRole,
}: {
  dealId: string
  agreedAmount: number
  notes?: string | null
  actorId: string
  actorRole: string
}): Promise<RecordResult> {
  if (!Number.isFinite(agreedAmount) || agreedAmount <= 0) return { error: 'INVALID_AMOUNT' as const }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { property: { select: { title: true } } },
  })
  if (!deal) return { error: 'NOT_FOUND' as const }
  if (actorRole === 'AGENT' && deal.agentId !== actorId) return { error: 'FORBIDDEN' as const }
  if (deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' as const }

  const record = await prisma.$transaction(async (tx) => {
    await tx.offlineNegotiation.updateMany({
      where: { dealId, supersededAt: null },
      data: { supersededAt: new Date() },
    })

    const created = await tx.offlineNegotiation.create({
      data: {
        dealId,
        agreedAmount,
        notes: notes?.trim() || null,
        recordedById: actorId,
      },
      include: { recordedBy: { select: { name: true } } },
    })

    await recordAudit(
      {
        action: 'NEGOTIATION_EVENT_RECORDED',
        actorId,
        entity: 'OfflineNegotiation',
        entityId: created.id,
        meta: { dealId, agreedAmount, by: actorRole },
      },
      tx
    )

    return created
  })

  return { record, deal }
}

/** A party confirming the recorded figure is what they agreed.
 *
 *  Once both have confirmed, the amount becomes Deal.agreedPrice — the single
 *  point at which an off-platform conversation becomes the deal's real price.
 */
export async function confirmOfflineNegotiation({
  negotiationId,
  actorId,
}: {
  negotiationId: string
  actorId: string
}): Promise<ConfirmResult> {
  const record = await prisma.offlineNegotiation.findUnique({
    where: { id: negotiationId },
    include: { deal: { include: { property: { select: { title: true } } } } },
  })
  if (!record) return { error: 'NOT_FOUND' as const }
  if (record.supersededAt) return { error: 'SUPERSEDED' as const }
  if (record.deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' as const }

  const party = partyFor(record.deal, actorId)
  if (!party) return { error: 'FORBIDDEN' as const }
  if (party === 'BUYER' ? record.buyerConfirmed : record.sellerConfirmed) {
    return { error: 'ALREADY_ACTED' as const }
  }

  const now = new Date()
  const bothConfirmed = party === 'BUYER' ? record.sellerConfirmed : record.buyerConfirmed

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.offlineNegotiation.update({
      where: { id: negotiationId },
      data: {
        ...(party === 'BUYER'
          ? { buyerConfirmed: true, buyerActedAt: now }
          : { sellerConfirmed: true, sellerActedAt: now }),
        // Confirming settles any dispute this party had raised.
        ...(record.disputedBy === party ? { resolvedAt: now } : {}),
      },
    })

    if (bothConfirmed) {
      await tx.deal.update({ where: { id: record.dealId }, data: { agreedPrice: record.agreedAmount } })
    }

    await recordAudit(
      {
        action: party === 'BUYER' ? 'BUYER_CONFIRMED' : 'SELLER_CONFIRMED',
        actorId,
        entity: 'OfflineNegotiation',
        entityId: negotiationId,
        meta: { dealId: record.dealId, agreedAmount: record.agreedAmount, bothConfirmed },
      },
      tx
    )

    return next
  })

  return { record: updated, deal: record.deal, party, bothConfirmed }
}

/** A party saying the recorded figure is wrong.
 *
 *  Blocks the deal's stage from advancing until staff resolve it, either by
 *  correcting the amount (which supersedes this record) or by marking it
 *  resolved after talking to the party.
 */
export async function disputeOfflineNegotiation({
  negotiationId,
  note,
  actorId,
}: {
  negotiationId: string
  note?: string | null
  actorId: string
}): Promise<DisputeResult> {
  const record = await prisma.offlineNegotiation.findUnique({
    where: { id: negotiationId },
    include: { deal: { include: { property: { select: { title: true } } } } },
  })
  if (!record) return { error: 'NOT_FOUND' as const }
  if (record.supersededAt) return { error: 'SUPERSEDED' as const }
  if (record.deal.status !== 'IN_PROGRESS') return { error: 'DEAL_FINISHED' as const }

  const party = partyFor(record.deal, actorId)
  if (!party) return { error: 'FORBIDDEN' as const }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.offlineNegotiation.update({
      where: { id: negotiationId },
      data: {
        disputedBy: party,
        disputedNote: note?.trim() || null,
        disputedAt: now,
        resolvedAt: null,
        // A party who disputes has plainly not confirmed, whatever was recorded
        // before.
        ...(party === 'BUYER'
          ? { buyerConfirmed: false, buyerActedAt: now }
          : { sellerConfirmed: false, sellerActedAt: now }),
      },
    })

    await recordAudit(
      {
        action: 'NEGOTIATION_DISPUTED',
        actorId,
        entity: 'OfflineNegotiation',
        entityId: negotiationId,
        meta: { dealId: record.dealId, party, agreedAmount: record.agreedAmount, note: note?.trim() || null },
      },
      tx
    )

    return next
  })

  return { record: updated, deal: record.deal, party }
}

/** Staff closing out a dispute without changing the figure — the party was
 *  called, the misunderstanding was cleared up. The party still has to confirm
 *  afterwards; this only unblocks the deal. */
export async function resolveNegotiationDispute({
  negotiationId,
  actorId,
  actorRole,
}: {
  negotiationId: string
  actorId: string
  actorRole: string
}): Promise<ResolveResult> {
  const record = await prisma.offlineNegotiation.findUnique({
    where: { id: negotiationId },
    include: { deal: true },
  })
  if (!record) return { error: 'NOT_FOUND' as const }
  if (actorRole === 'AGENT' && record.deal.agentId !== actorId) return { error: 'FORBIDDEN' as const }
  if (!record.disputedAt || record.resolvedAt) return { error: 'NOT_DISPUTED' as const }

  const updated = await prisma.offlineNegotiation.update({
    where: { id: negotiationId },
    data: { resolvedAt: new Date() },
  })

  await recordAudit({
    action: 'NEGOTIATION_DISPUTE_RESOLVED',
    actorId,
    entity: 'OfflineNegotiation',
    entityId: negotiationId,
    meta: { dealId: record.dealId, by: actorRole },
  })

  return { record: updated, deal: record.deal }
}

export function offlineNegotiationErrorMessage(error: OfflineNegotiationError): { message: string; status: number } {
  switch (error) {
    case 'NOT_FOUND':
      return { message: 'Record not found', status: 404 }
    case 'FORBIDDEN':
      return { message: 'You are not a party to this deal', status: 403 }
    case 'SUPERSEDED':
      return { message: 'A newer figure has since been recorded — respond to that one instead', status: 409 }
    case 'ALREADY_ACTED':
      return { message: 'You have already confirmed this figure', status: 409 }
    case 'DEAL_FINISHED':
      return { message: 'This deal is finished', status: 409 }
    case 'INVALID_AMOUNT':
      return { message: 'Enter a valid amount', status: 400 }
    case 'NOT_DISPUTED':
      return { message: 'There is no open dispute on this record', status: 409 }
  }
}
