import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { notifyUsers } from '@/lib/notify'
import { siteVisitDTO } from '../route'

/** Transition a site visit.
 *  AGENT: action=schedule (needs scheduledDate) | complete (optional feedback) | cancel.
 *  BUYER: action=cancel (own visits only). */
export const PATCH = withApi(async (req, { params }) => {
  const user = await authenticate(req, ['BUYER', 'AGENT'])
  const { id } = await params
  const body = await readJson<{ action?: string; scheduledDate?: string; feedback?: string }>(req)
  const action = String(body.action ?? '')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new ApiError('Visit not found', 404)

  const isBuyerOwner = user.role === 'BUYER' && visit.buyerId === user.id
  const isAgentOwner = user.role === 'AGENT' && visit.agentId === user.id

  if (action === 'cancel') {
    if (!isBuyerOwner && !isAgentOwner) throw new ApiError('Forbidden', 403)
    if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') throw new ApiError('Visit already closed', 400)
    const updated = await prisma.siteVisit.update({ where: { id }, data: { status: 'CANCELLED' } })
    const notifyId = user.role === 'BUYER' ? visit.agentId : visit.buyerId
    if (notifyId) {
      await notifyUsers([{ userId: notifyId, title: 'Site visit cancelled', message: `The visit to ${visit.property.title} was cancelled.` }])
    }
    return ok(siteVisitDTO(updated))
  }

  // Remaining actions are agent-only.
  if (user.role !== 'AGENT') throw new ApiError('Forbidden — agents only', 403)

  if (action === 'schedule') {
    const scheduledDate = new Date(String(body.scheduledDate ?? ''))
    if (Number.isNaN(scheduledDate.getTime())) throw new ApiError('scheduledDate must be a valid date', 400)
    const updated = await prisma.siteVisit.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledDate, agentId: user.id },
    })
    await notifyUsers([{ userId: visit.buyerId, title: 'Site visit scheduled', message: `Your visit to ${visit.property.title} is confirmed.` }])
    return ok(siteVisitDTO(updated))
  }

  if (action === 'complete') {
    if (!isAgentOwner) throw new ApiError('Forbidden', 403)
    const feedback = typeof body.feedback === 'string' && body.feedback.trim() ? body.feedback.trim() : null
    const updated = await prisma.siteVisit.update({ where: { id }, data: { status: 'COMPLETED', feedback } })
    await notifyUsers([{ userId: visit.buyerId, title: 'Site visit completed', message: `Your visit to ${visit.property.title} was marked complete.` }])
    return ok(siteVisitDTO(updated))
  }

  throw new ApiError('Unknown action — expected schedule, complete, or cancel', 400)
})
