'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'

async function requireRole(...roles: string[]) {
  const session = await getServerSession(authOptions)
  if (!session || !roles.includes(session.user.role)) throw new Error('Unauthorized')
  return session
}

function parseDate(value: FormDataEntryValue | null, label: string): Date {
  const d = new Date(String(value ?? ''))
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`)
  return d
}

function revalidate() {
  revalidatePath('/dashboard/site-visits')
  revalidatePath('/dashboard')
}

/** Buyer requests a site visit. Auto-routes to the property's assigned agent (if
 *  any) so it lands in that agent's queue. Blocked when the platform toggle is off. */
export async function requestSiteVisit(formData: FormData) {
  const session = await requireRole('BUYER')

  const config = await prisma.appConfig.findFirst({ select: { siteVisitsEnabled: true } })
  if (config && config.siteVisitsEnabled === false) throw new Error('Site visits are currently disabled')

  const propertyId = String(formData.get('propertyId') ?? '')
  if (!propertyId) throw new Error('Missing propertyId')
  const requestedDate = parseDate(formData.get('requestedDate'), 'date')
  const buyerNote = String(formData.get('buyerNote') ?? '').trim() || null

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { title: true, agentId: true },
  })
  if (!property) throw new Error('Property not found')

  await prisma.siteVisit.create({
    data: {
      propertyId,
      buyerId: session.user.id,
      agentId: property.agentId,
      requestedDate,
      buyerNote,
      status: 'REQUESTED',
    },
  })

  if (property.agentId) {
    await notifyUsers([
      {
        userId: property.agentId,
        title: 'New site-visit request',
        message: `${session.user.name} requested a visit to ${property.title}.`,
      },
    ])
  }

  revalidate()
}

/** Agent schedules a REQUESTED visit — claims it and sets the confirmed date. */
export async function scheduleSiteVisit(formData: FormData) {
  const session = await requireRole('AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const scheduledDate = parseDate(formData.get('scheduledDate'), 'date')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')

  await prisma.siteVisit.update({
    where: { id },
    data: { status: 'SCHEDULED', scheduledDate, agentId: session.user.id },
  })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: 'Site visit scheduled',
      message: `Your visit to ${visit.property.title} is confirmed for ${scheduledDate.toLocaleString('en-IN')}.`,
    },
  ])

  revalidate()
}

/** Agent marks a visit COMPLETED and records post-visit feedback. */
export async function completeSiteVisit(formData: FormData) {
  await requireRole('AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')
  const feedback = String(formData.get('feedback') ?? '').trim() || null

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')

  await prisma.siteVisit.update({ where: { id }, data: { status: 'COMPLETED', feedback } })

  await notifyUsers([
    {
      userId: visit.buyerId,
      title: 'Site visit completed',
      message: `Your visit to ${visit.property.title} was marked complete.`,
    },
  ])

  revalidate()
}

/** Cancel a visit. A buyer can cancel their own; an agent can cancel one assigned
 *  to them. Terminal states (COMPLETED/CANCELLED) can't be cancelled again. */
export async function cancelSiteVisit(formData: FormData) {
  const session = await requireRole('BUYER', 'AGENT')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing id')

  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: { property: { select: { title: true } } },
  })
  if (!visit) throw new Error('Visit not found')

  const isOwner =
    (session.user.role === 'BUYER' && visit.buyerId === session.user.id) ||
    (session.user.role === 'AGENT' && visit.agentId === session.user.id)
  if (!isOwner) throw new Error('Unauthorized')
  if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') throw new Error('Visit already closed')

  await prisma.siteVisit.update({ where: { id }, data: { status: 'CANCELLED' } })

  // Notify the counterparty.
  const notifyId = session.user.role === 'BUYER' ? visit.agentId : visit.buyerId
  if (notifyId) {
    await notifyUsers([
      {
        userId: notifyId,
        title: 'Site visit cancelled',
        message: `The visit to ${visit.property.title} was cancelled.`,
      },
    ])
  }

  revalidate()
}
