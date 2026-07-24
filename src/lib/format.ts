export function formatINR(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`
  return `₹${(amount / 100000).toFixed(1)}L`
}

/** Short Indian-numbering hint for a raw amount as the user types it, e.g. 10000000 -> "1 Cr". */
export function formatMoneyHint(amount: number): string {
  if (!amount || amount <= 0) return ''
  if (amount >= 10000000) return `${trimZeros(amount / 10000000)} Cr`
  if (amount >= 100000) return `${trimZeros(amount / 100000)} Lakh`
  if (amount >= 1000) return `${trimZeros(amount / 1000)} K`
  return String(amount)
}

function trimZeros(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** SLA-style aging bucket for review queues (listings/KYC/offers waiting on
 *  staff action) — escalates color the longer something has sat untouched,
 *  the pattern ops teams at 99acres/MagicBricks-style portals use to triage
 *  a queue instead of treating every item as equally urgent. */
export function agingBucket(date: Date): { label: string; tone: 'green' | 'amber' | 'red' } {
  const diffDay = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
  const label = diffDay <= 0 ? 'Today' : `Waiting ${diffDay}d`
  const tone = diffDay >= 4 ? 'red' : diffDay >= 2 ? 'amber' : 'green'
  return { label, tone }
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}
