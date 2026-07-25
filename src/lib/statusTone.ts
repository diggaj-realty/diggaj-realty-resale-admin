/** Maps any status string to a UI tone. Pure/no imports — must stay importable
 *  from client components (e.g. StatusPill) without dragging in Prisma/pg,
 *  which breaks the browser bundle (pg needs Node's `dns` module). */
export function statusTone(status: string): string {
  const s = status.toUpperCase()
  if (['LIVE', 'CLOSED', 'ACCEPTED', 'APPROVED'].includes(s)) return 'green'
  if (['PENDING_VERIFICATION', 'PENDING', 'PENDING_REVIEW', 'UNDER_REVIEW'].includes(s)) return 'gold'
  if (['IN_PROGRESS', 'COUNTERED'].includes(s)) return 'blue'
  if (['REJECTED'].includes(s)) return 'red'
  return 'purple'
}
