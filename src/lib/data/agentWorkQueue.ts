import { prisma } from '@/lib/prisma'
import { leadBreach, LEAD_SLA, type LeadBreach } from '@/lib/data/agentAssignment'

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

  // Which of this agent's deals are blocked, asked of the blocking records
  // directly. Loading every in-progress deal and then asking "is this one
  // disputed? is this one queried?" per row was 2N queries to find the handful
  // that are usually zero.
  const blockedDealWhere = { agentId, status: 'IN_PROGRESS' } as const

  const [visits, leads, disputed, queried, claimable] = await Promise.all([
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
      // The breach clocks pushed into SQL rather than loading an agent's whole
      // live book to throw most of it away. leadBreach still decides — this only
      // narrows to rows that could possibly breach, so the two cannot disagree.
      where: {
        agentId,
        status: { in: LIVE_LEAD_STATUSES },
        OR: [
          {
            status: { in: ['NEW', 'AGENT_ASSIGNED', 'CONTACT_REQUESTED'] },
            createdAt: { lt: new Date(now.getTime() - LEAD_SLA.uncontactedHours * 36e5) },
          },
          { updatedAt: { lt: new Date(now.getTime() - LEAD_SLA.stalledDays * 24 * 36e5) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      include: {
        property: { select: { title: true } },
        buyer: { select: { name: true, phone: true } },
      },
    }),
    prisma.offlineNegotiation.findMany({
      where: { supersededAt: null, disputedAt: { not: null }, resolvedAt: null, deal: blockedDealWhere },
      select: { dealId: true },
      distinct: ['dealId'],
    }),
    prisma.costSheet.findMany({
      where: { status: 'SENT', queriedAt: { not: null }, resolvedAt: null, deal: blockedDealWhere },
      select: { dealId: true },
      distinct: ['dealId'],
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
  const disputedIds = new Set(disputed.map((d) => d.dealId))
  const blockedIds = [...new Set([...disputedIds, ...queried.map((q) => q.dealId)])]
  const blockedDealRows = blockedIds.length
    ? await prisma.deal.findMany({
        where: { id: { in: blockedIds } },
        include: { property: { select: { title: true } }, buyer: { select: { name: true, phone: true } } },
      })
    : []

  const blockedDeals: WorkItem[] = blockedDealRows.map((d) => ({
    id: d.id,
    href: `/dashboard/deals/${d.id}`,
    who: d.buyer.name,
    what: d.property.title,
    reason: disputedIds.has(d.id) ? 'buyer disputes the agreed price' : 'buyer queried the cost breakdown',
    urgency: 'NOW',
    phone: d.buyer.phone,
  }))

  return {
    visitsToday,
    overdueLeads,
    blockedDeals,
    claimable,
    isClear: visitsToday.length === 0 && overdueLeads.length === 0 && blockedDeals.length === 0,
  }
}
