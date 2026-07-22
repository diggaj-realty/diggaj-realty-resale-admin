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
