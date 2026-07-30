import { leadBreach, LEAD_BREACH_LABELS } from '@/lib/data/agentAssignment'

const TONE: Record<string, { background: string; color: string }> = {
  UNASSIGNED: { background: 'var(--red-50)', color: 'var(--red-700)' },
  UNCONTACTED: { background: 'var(--red-50)', color: 'var(--red-700)' },
  STALLED: { background: 'var(--amber-50)', color: 'var(--amber-700)' },
}

/** Why a lead is overdue, not merely how old it is.
 *
 *  Replaces the generic aging chip on lead rows: "Waiting 3d" doesn't say whether
 *  nobody has picked the lead up or somebody has and then let it go quiet, and
 *  those need different responses. Renders nothing when the lead is on track, so
 *  a healthy queue stays visually calm and a breach actually stands out. */
export default function LeadBreachBadge({
  lead,
}: {
  lead: { status: string; agentId: string | null; createdAt: Date; updatedAt: Date }
}) {
  const breach = leadBreach(lead)
  if (!breach) return null

  const age =
    breach.hoursSince >= 48 ? `${Math.floor(breach.hoursSince / 24)}d` : `${breach.hoursSince}h`

  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={TONE[breach.breach]}
      title={`${LEAD_BREACH_LABELS[breach.breach]} for ${age}`}
    >
      {LEAD_BREACH_LABELS[breach.breach]} · {age}
    </span>
  )
}
