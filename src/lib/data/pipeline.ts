import { prisma } from '@/lib/prisma'
import { leadBreach } from '@/lib/data/agentAssignment'
import type { Prisma } from '@prisma/client'

/** One buyer-and-property thread, wherever it has got to.
 *
 *  Leads, Site Visits, Negotiations, Accepted Offers and Deals are five pages for
 *  what is one process on one buyer, so staff had to know the funnel's shape to
 *  navigate it and hold the context themselves while hopping between tabs. A thread
 *  is the thing they actually work; this assembles it.
 *
 *  Built from PropertyInterest, because a lead is where a thread starts and it
 *  survives all the way to CONVERTED_TO_DEAL. Deals opened straight from an
 *  accepted offer never had a lead, so those are picked up separately — otherwise
 *  the view would quietly omit live transactions, which is worse than not having it.
 */

export const PIPELINE_COLUMNS = [
  'NEW',
  'CONTACTED',
  'VISIT',
  'NEGOTIATING',
  'DEAL',
  'CLOSED',
] as const

export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number]

export const PIPELINE_COLUMN_LABELS: Record<PipelineColumn, string> = {
  NEW: 'New',
  CONTACTED: 'In contact',
  VISIT: 'Site visit',
  NEGOTIATING: 'Negotiating',
  DEAL: 'Deal in progress',
  CLOSED: 'Closed',
}

/** Which column a lead status belongs in.
 *
 *  Six columns rather than the thirteen lead statuses: a board is for seeing where
 *  everything is at a glance, and thirteen columns is a spreadsheet. The detail
 *  stays on the lead itself. */
function columnForLeadStatus(status: string): PipelineColumn {
  switch (status) {
    case 'NEW':
      return 'NEW'
    case 'CONTACT_REQUESTED':
    case 'AGENT_ASSIGNED':
    case 'CONTACT_IN_PROGRESS':
      return 'CONTACTED'
    case 'SITE_VISIT_REQUESTED':
    case 'SITE_VISIT_SCHEDULED':
    case 'SITE_VISIT_COMPLETED':
      return 'VISIT'
    case 'INTERESTED':
    case 'NEGOTIATION_IN_PROGRESS':
      return 'NEGOTIATING'
    case 'CONVERTED_TO_DEAL':
      return 'DEAL'
    default:
      return 'CLOSED'
  }
}

export interface PipelineThread {
  /** The lead id where there is one, else the deal id — always a real link target. */
  id: string
  href: string
  column: PipelineColumn
  buyerName: string
  buyerPhone: string | null
  propertyTitle: string
  propertyLocation: string
  askingPrice: number
  agentName: string | null
  agentId: string | null
  /** The precise status behind the column, for the row's second line. */
  detail: string
  /** Set when the thread wants attention, with the reason. */
  flag: string | null
  updatedAt: Date
  /** True for threads assembled from a deal that never had a lead. */
  dealOnly: boolean
}

export interface Pipeline {
  columns: { key: PipelineColumn; label: string; threads: PipelineThread[] }[]
  total: number
  flagged: number
}

/**
 * The whole pipeline, or one agent's slice of it.
 *
 *  `agentId` scopes to an agent's own book, matching what every one of the five
 *  pages this replaces already did.
 */
export async function getPipeline({ agentId }: { agentId?: string } = {}): Promise<Pipeline> {
  const leadWhere: Prisma.PropertyInterestWhereInput = agentId ? { agentId } : {}
  const dealWhere: Prisma.DealWhereInput = agentId ? { agentId } : {}

  const [leads, deals] = await Promise.all([
    prisma.propertyInterest.findMany({
      where: leadWhere,
      orderBy: { updatedAt: 'desc' },
      take: 300,
      include: {
        property: { select: { title: true, location: true, askingPrice: true } },
        buyer: { select: { name: true, phone: true } },
        agent: { select: { id: true, name: true } },
        siteVisits: { select: { status: true, scheduledDate: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        negotiationSessions: { select: { dealId: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    // Deals from an accepted offer have no lead behind them, so they would be
    // invisible on a board built only from leads.
    prisma.deal.findMany({
      where: dealWhere,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        property: { select: { id: true, title: true, location: true, askingPrice: true } },
        buyer: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true } },
      },
    }),
  ])

  const threads: PipelineThread[] = leads.map((l) => {
    const breach = leadBreach(l)
    const visit = l.siteVisits[0]
    const dealId = l.negotiationSessions[0]?.dealId ?? null
    return {
      id: l.id,
      href: `/dashboard/leads/${l.id}`,
      column: columnForLeadStatus(l.status),
      buyerName: l.buyer.name,
      buyerPhone: l.buyer.phone,
      propertyTitle: l.property.title,
      propertyLocation: l.property.location,
      askingPrice: l.property.askingPrice,
      agentName: l.agent?.name ?? null,
      agentId: l.agentId,
      detail:
        visit && l.status.startsWith('SITE_VISIT') && visit.scheduledDate
          ? `${l.status.replace(/_/g, ' ').toLowerCase()} · ${visit.scheduledDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
          : l.status.replace(/_/g, ' ').toLowerCase(),
      flag: breach ? breach.breach.replace(/_/g, ' ').toLowerCase() : !l.agentId ? 'unassigned' : null,
      updatedAt: l.updatedAt,
      dealOnly: false,
    }
  })

  // A lead that converted already appears in DEAL; adding its deal again would
  // double-count the same thread.
  const leadBuyerProperty = new Set(leads.map((l) => `${l.propertyId}:${l.buyerId}`))
  for (const d of deals) {
    if (leadBuyerProperty.has(`${d.propertyId}:${d.buyerId}`)) continue
    threads.push({
      id: d.id,
      href: `/dashboard/deals/${d.id}`,
      column: d.status === 'IN_PROGRESS' ? 'DEAL' : 'CLOSED',
      buyerName: d.buyer.name,
      buyerPhone: d.buyer.phone,
      propertyTitle: d.property.title,
      propertyLocation: d.property.location,
      askingPrice: d.agreedPrice,
      agentName: d.agent?.name ?? null,
      agentId: d.agentId,
      detail: d.status === 'FELL_THROUGH' ? 'fell through' : d.status.replace(/_/g, ' ').toLowerCase(),
      flag: !d.agentId ? 'unassigned' : null,
      updatedAt: d.updatedAt,
      dealOnly: true,
    })
  }

  const columns = PIPELINE_COLUMNS.map((key) => ({
    key,
    label: PIPELINE_COLUMN_LABELS[key],
    threads: threads
      .filter((t) => t.column === key)
      // Flagged first inside each column: the board is for spotting what is stuck.
      .sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || b.updatedAt.getTime() - a.updatedAt.getTime()),
  }))

  return { columns, total: threads.length, flagged: threads.filter((t) => t.flag).length }
}
