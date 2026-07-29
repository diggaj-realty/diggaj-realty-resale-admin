import { prisma } from '@/lib/prisma'
import { leadBreach, type LeadBreach } from '@/lib/data/agentAssignment'
import { hasPriceDispute } from '@/lib/data/offlineNegotiation'
import { hasOpenCostSheetQuery } from '@/lib/data/costSheets'

/** What an agent should do today.
 *
 *  Their landing page was four stat tiles reading zero, a Quick Actions grid
 *  duplicating the sidebar, and two empty charts — an answer to "how am I doing"
 *  that nobody had asked, and no answer at all to "who do I call". An agent's day
 *  is a list of people, so this is that list.
 *
 *  Ordered by what goes wrong if it is ignored: a visit happening today cannot be
 *  rescheduled after the fact, a lead nobody has rung is the promise the platform
 *  made on their behalf, and a blocked deal is money sitting still.
 */

export interface WorkItem {
  id: string
  href: string
  who: string
  what: string
  /** Why it is on the list, shown as the reason rather than a bare age. */
  reason: string
  urgency: 'NOW' | 'SOON' | 'WAITING'
  phone: string | null
}

export interface AgentWorkQueue {
  visitsToday: WorkItem[]
  overdueLeads: WorkItem[]
  blockedDeals: WorkItem[]
  claimable: number
  /** True when there is genuinely nothing to do, as opposed to nothing loaded. */
  isClear: boolean
}

const LIVE_LEAD_STATUSES = [
  'NEW',
  'CONTACT_REQUESTED',
  'AGENT_ASSIGNED',
  'CONTACT_IN_PROGRESS',
  'SITE_VISIT_REQUESTED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'INTERESTED',
  'NEGOTIATION_IN_PROGRESS',
]

const BREACH_COPY: Record<LeadBreach, string> = {
  UNASSIGNED: 'nobody has picked this up',
  UNCONTACTED: 'never contacted',
  STALLED: 'no movement',
}

function dayBounds(now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export async function getAgentWorkQueue(agentId: string, now: Date = new Date()): Promise<AgentWorkQueue> {
  const { start, end } = dayBounds(now)
  const soon = new Date(start)
  soon.setDate(soon.getDate() + 3)

  const [visits, leads, deals, claimable] = await Promise.all([
    // Today first, then the next three days — far enough to plan around, close
    // enough to still be today's problem.
    prisma.siteVisit.findMany({
      where: { agentId, status: 'SCHEDULED', scheduledDate: { gte: start, lt: soon } },
      orderBy: { scheduledDate: 'asc' },
      include: {
        property: { select: { title: true, location: true } },
        buyer: { select: { name: true, phone: true } },
      },
    }),
    prisma.propertyInterest.findMany({
      where: { agentId, status: { in: LIVE_LEAD_STATUSES } },
      orderBy: { updatedAt: 'asc' },
      include: {
        property: { select: { title: true } },
        buyer: { select: { name: true, phone: true } },
      },
    }),
    prisma.deal.findMany({
      where: { agentId, status: 'IN_PROGRESS' },
      include: { property: { select: { title: true } }, buyer: { select: { name: true, phone: true } } },
    }),
    // The unassigned pool an agent can take from — a count, not a list, so it
    // reads as an opportunity rather than another obligation.
    prisma.propertyInterest.count({ where: { agentId: null, status: { in: LIVE_LEAD_STATUSES } } }),
  ])

  const visitsToday: WorkItem[] = visits.map((v) => {
    const isToday = v.scheduledDate! < end
    return {
      id: v.id,
      href: v.interestId ? `/dashboard/leads/${v.interestId}` : '/dashboard/site-visits',
      who: v.buyer.name,
      what: v.property.title,
      reason: isToday
        ? `today, ${v.scheduledDate!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
        : v.scheduledDate!.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      urgency: isToday ? 'NOW' : 'SOON',
      phone: v.buyer.phone,
    }
  })

  const overdueLeads: WorkItem[] = leads
    .map((l) => ({ lead: l, breach: leadBreach(l, now) }))
    .filter((x): x is { lead: (typeof leads)[number]; breach: NonNullable<ReturnType<typeof leadBreach>> } => x.breach != null)
    .map(({ lead, breach }) => ({
      id: lead.id,
      href: `/dashboard/leads/${lead.id}`,
      who: lead.buyer.name,
      what: lead.property.title,
      reason: `${BREACH_COPY[breach.breach]} · ${breach.hoursSince >= 48 ? `${Math.floor(breach.hoursSince / 24)}d` : `${breach.hoursSince}h`}`,
      urgency: breach.breach === 'STALLED' ? 'SOON' : 'NOW',
      phone: lead.buyer.phone,
    }))

  // A deal the buyer has objected to is stuck until somebody answers them, and
  // the platform will not let its stage advance meanwhile — so it belongs on a
  // to-do list rather than being discoverable only by opening each deal.
  const blocked = await Promise.all(
    deals.map(async (d) => {
      const [priceDisputed, sheetQueried] = await Promise.all([
        hasPriceDispute(d.id),
        hasOpenCostSheetQuery(d.id),
      ])
      if (!priceDisputed && !sheetQueried) return null
      const item: WorkItem = {
        id: d.id,
        href: `/dashboard/deals/${d.id}`,
        who: d.buyer.name,
        what: d.property.title,
        reason: priceDisputed ? 'buyer disputes the agreed price' : 'buyer queried the cost breakdown',
        urgency: 'NOW',
        phone: d.buyer.phone,
      }
      return item
    })
  )
  const blockedDeals = blocked.filter((x): x is WorkItem => x != null)

  return {
    visitsToday,
    overdueLeads,
    blockedDeals,
    claimable,
    isClear: visitsToday.length === 0 && overdueLeads.length === 0 && blockedDeals.length === 0,
  }
}
