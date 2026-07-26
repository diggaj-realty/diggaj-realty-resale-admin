/** Maps any status string to a UI tone. Pure/no imports — must stay importable
 *  from client components (e.g. StatusPill) without dragging in Prisma/pg,
 *  which breaks the browser bundle (pg needs Node's `dns` module). */
export function statusTone(status: string): string {
  const s = status.toUpperCase()
  if (['LIVE', 'CLOSED', 'ACCEPTED', 'APPROVED', 'INTERESTED', 'COMPLETED'].includes(s)) return 'green'
  if (['PENDING_VERIFICATION', 'PENDING', 'PENDING_REVIEW', 'UNDER_REVIEW', 'REQUESTED'].includes(s)) return 'gold'
  if (['IN_PROGRESS', 'COUNTERED', 'UNDER_CONTRACT', 'SCHEDULED'].includes(s)) return 'blue'
  if (['NOT_INTERESTED'].includes(s)) return 'red'
  if (['REJECTED', 'CANCELLED'].includes(s)) return 'red'
  return 'purple'
}
