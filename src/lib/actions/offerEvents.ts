import { prisma } from '@/lib/prisma'

export type OfferEventType =
  | 'CREATED'
  | 'FORWARDED'
  | 'COUNTERED_BACKEND'
  | 'COUNTERED_SELLER'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COUNTER_ACCEPTED'
  | 'COUNTER_REJECTED'

interface LogOfferEventInput {
  offerId: string
  type: OfferEventType
  amount?: number | null
  actorId?: string | null
  actorRole?: string | null
  note?: string | null
}

/** Not a server action — internal helper called from within offers.ts/backend.ts actions. */
export async function logOfferEvent({ offerId, type, amount, actorId, actorRole, note }: LogOfferEventInput) {
  await prisma.offerEvent.create({
    data: {
      offerId,
      type,
      amount: amount ?? null,
      actorId: actorId ?? null,
      actorRole: actorRole ?? null,
      note: note ?? null,
    },
  })
}
