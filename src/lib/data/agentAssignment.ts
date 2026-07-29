import { prisma } from '@/lib/prisma'

/** Picking an agent for a lead nobody owns.
 *
 *  Until now a lead inherited Property.agentId or nothing at all, and "nothing at
 *  all" meant it sat at NEW until a human noticed — the state that produced deals
 *  with no agent on them. Every listing without an agent was a silent hole in the
 *  funnel.
 *
 *  The rule:
 *
 *   1. Whoever already works this buyer. A buyer with three live leads should
 *      deal with one person, not three — see the collision problem this also
 *      addresses.
 *   2. Otherwise the least busy agent, with familiarity in the property's city
 *      breaking ties.
 *
 *  Balance comes before familiarity deliberately. Filtering to agents who had
 *  already worked a city — the first thing tried here — turned out to be a
 *  feedback loop: whoever happened to take the first lead in a city was the only
 *  "city agent", so they took every subsequent one no matter how loaded they got.
 *  Six consecutive leads went to one of two available agents. City is now a
 *  tiebreaker, which gives the intended nudge without the runaway.
 *
 *  "Busy" counts live leads only. Closed and converted ones are finished work and
 *  shouldn't make someone look loaded forever.
 */

/** Lead statuses that still need working. Mirrors the terminal set in
 *  interests.ts, kept as a query filter rather than imported so this module has
 *  no cycle back into it. */
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

export type AssignmentReason =
  | 'ALREADY_WORKS_BUYER'
  /** Least busy, and they already work this city — the tie went to familiarity. */
  | 'LEAST_BUSY_CITY_MATCH'
  | 'LEAST_BUSY'
  | 'NO_ACTIVE_AGENTS'

export interface AssignmentPick {
  agentId: string | null
  reason: AssignmentReason
}

/** Live-lead count per agent id, for the agents given. */
async function loadFor(agentIds: string[]): Promise<Map<string, number>> {
  if (agentIds.length === 0) return new Map()
  const grouped = await prisma.propertyInterest.groupBy({
    by: ['agentId'],
    where: { agentId: { in: agentIds }, status: { in: LIVE_LEAD_STATUSES } },
    _count: { _all: true },
  })
  const counts = new Map(agentIds.map((id) => [id, 0]))
  for (const row of grouped) {
    if (row.agentId) counts.set(row.agentId, row._count._all)
  }
  return counts
}

/** Least busy first, then agents who already work this city, then id.
 *
 *  Sorting rather than filtering on city is what stops the assignment loop from
 *  concentrating on one agent — see the note at the top of this file. Id is the
 *  final tiebreak so the choice is stable and testable rather than depending on
 *  row order. */
function rank(agentIds: string[], load: Map<string, number>, cityAgents: Set<string>): string[] {
  return [...agentIds].sort((a, b) => {
    const byLoad = (load.get(a) ?? 0) - (load.get(b) ?? 0)
    if (byLoad !== 0) return byLoad
    const byCity = Number(cityAgents.has(b)) - Number(cityAgents.has(a))
    if (byCity !== 0) return byCity
    return a.localeCompare(b)
  })
}

/**
 * Chooses the agent to own a new lead, or null when there are no active agents.
 *
 *  Returns the reason as well as the pick, so the audit trail records *why* a
 *  lead went where it did — "least busy" and "already works this buyer" are very
 *  different explanations to give an agent asking why they got something.
 */
export async function pickAgentForLead({
  buyerId,
  city,
}: {
  buyerId: string
  city: string | null
}): Promise<AssignmentPick> {
  const activeAgents = await prisma.user.findMany({
    where: { role: 'AGENT', isActive: true },
    select: { id: true },
  })
  const agentIds = activeAgents.map((a) => a.id)
  if (agentIds.length === 0) return { agentId: null, reason: 'NO_ACTIVE_AGENTS' }

  // 1. Continuity: whoever is already working this buyer.
  const existing = await prisma.propertyInterest.findFirst({
    where: { buyerId, agentId: { in: agentIds }, status: { in: LIVE_LEAD_STATUSES } },
    orderBy: { updatedAt: 'desc' },
    select: { agentId: true },
  })
  if (existing?.agentId) return { agentId: existing.agentId, reason: 'ALREADY_WORKS_BUYER' }

  const load = await loadFor(agentIds)

  // 2. Least busy, with city familiarity only breaking ties.
  const cityAgents = new Set<string>()
  if (city) {
    const inCity = await prisma.propertyInterest.findMany({
      where: { agentId: { in: agentIds }, property: { city } },
      select: { agentId: true },
      distinct: ['agentId'],
    })
    for (const row of inCity) if (row.agentId) cityAgents.add(row.agentId)
  }

  const picked = rank(agentIds, load, cityAgents)[0]
  return {
    agentId: picked,
    reason: cityAgents.has(picked) ? 'LEAST_BUSY_CITY_MATCH' : 'LEAST_BUSY',
  }
}

/** How long a lead may sit before it counts as neglected.
 *
 *  Two clocks, because they are different failures: nobody has picked it up, and
 *  somebody has but hasn't moved it. */
export const LEAD_SLA = {
  /** Unassigned — only reachable when there are no active agents, now that
   *  assignment is automatic. */
  unassignedHours: 4,
  /** Assigned but never worked past AGENT_ASSIGNED/NEW. */
  uncontactedHours: 24,
  /** Assigned, contacted, but untouched since. */
  stalledDays: 7,
} as const

export type LeadBreach = 'UNASSIGNED' | 'UNCONTACTED' | 'STALLED'

export interface AgeingLead {
  breach: LeadBreach
  hoursSince: number
}

/** Whether a lead has breached its SLA, judged from its own timestamps.
 *
 *  Pure so it can be used in a list render without a second query per row. */
export function leadBreach(
  lead: { status: string; agentId: string | null; createdAt: Date; updatedAt: Date },
  now: Date = new Date()
): AgeingLead | null {
  const TERMINAL = ['CONVERTED_TO_DEAL', 'CLOSED', 'CANCELLED', 'NOT_INTERESTED']
  if (TERMINAL.includes(lead.status)) return null

  const hours = (from: Date) => (now.getTime() - new Date(from).getTime()) / 36e5

  if (!lead.agentId) {
    const h = hours(lead.createdAt)
    return h >= LEAD_SLA.unassignedHours ? { breach: 'UNASSIGNED', hoursSince: Math.floor(h) } : null
  }

  // Still sitting where assignment left it — nobody has actually made contact.
  if (lead.status === 'NEW' || lead.status === 'AGENT_ASSIGNED' || lead.status === 'CONTACT_REQUESTED') {
    const h = hours(lead.createdAt)
    return h >= LEAD_SLA.uncontactedHours ? { breach: 'UNCONTACTED', hoursSince: Math.floor(h) } : null
  }

  const h = hours(lead.updatedAt)
  return h >= LEAD_SLA.stalledDays * 24 ? { breach: 'STALLED', hoursSince: Math.floor(h) } : null
}

export const LEAD_BREACH_LABELS: Record<LeadBreach, string> = {
  UNASSIGNED: 'Unassigned',
  UNCONTACTED: 'Not contacted',
  STALLED: 'No movement',
}
