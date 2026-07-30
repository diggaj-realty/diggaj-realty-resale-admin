'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { getAppConfig } from '@/lib/actions/appConfig'
import { recordAudit } from '@/lib/audit'
import { evaluateClosureGate } from '@/lib/data/closureGate'
import { collapseDeal } from '@/lib/data/dealCollapse'
import { declareDealStage, dealStageErrorMessage } from '@/lib/data/dealStageControl'
import { STAGE_LABELS } from '@/lib/data/dealProgress'

/** Paperwork/closing work is done by the assigned agent OR backend ops —
 *  not agent-only. Backend previously had no way to touch a deal at all. */
async function requireDealStaff(dealId: string, session: { user: { id: string; role: string } }) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new Error('Deal not found')
  const isAssignedAgent = session.user.role === 'AGENT' && deal.agentId === session.user.id
  const isBackendOrAdmin = session.user.role === 'BACKEND' || session.user.role === 'ADMIN'
  if (!isAssignedAgent && !isBackendOrAdmin) throw new Error('Unauthorized')
  return deal
}

export async function recordTokenPayment(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const tokenAmount = Number(formData.get('tokenAmount'))
  const tokenDateRaw = String(formData.get('tokenDate') || '')
  if (!tokenAmount || tokenAmount <= 0) throw new Error('Enter a valid token amount')
  if (!tokenDateRaw) throw new Error('Token date is required')

  await requireDealStaff(dealId, session)

  await prisma.deal.update({
    where: { id: dealId },
    data: { tokenAmount, tokenDate: new Date(tokenDateRaw) },
  })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

export async function recordFinalPayment(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const finalAmount = Number(formData.get('finalAmount'))
  const finalPaymentDateRaw = String(formData.get('finalPaymentDate') || '')
  const paymentMode = String(formData.get('paymentMode') || '')
  const transactionRef = String(formData.get('transactionRef') || '').trim()

  if (!finalAmount || finalAmount <= 0) throw new Error('Enter a valid final amount')
  if (!finalPaymentDateRaw) throw new Error('Final payment date is required')
  if (!['BANK_TRANSFER', 'CHEQUE', 'OTHER'].includes(paymentMode)) throw new Error('Invalid payment mode')

  await requireDealStaff(dealId, session)

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      finalAmount,
      finalPaymentDate: new Date(finalPaymentDateRaw),
      paymentMode,
      transactionRef: transactionRef || null,
    },
  })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

export async function updateDealNotes(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const notes = String(formData.get('notes') || '').trim()

  await requireDealStaff(dealId, session)

  await prisma.deal.update({
    where: { id: dealId },
    data: { notes: notes || null },
  })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
}

/** Free-text, dated progress-log entry ("Sale deed drafting in progress",
 *  "Waiting on seller's NOC") — distinct from the single overwritable
 *  `notes` field and from the structured DealDocument checklist. Both buyer
 *  and seller can read the log on the deal detail page; only staff post to it. */
export async function addDealLogEntry(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const message = String(formData.get('message') || '').trim()
  if (!message) throw new Error('Enter an update before posting')

  const deal = await requireDealStaff(dealId, session)

  await prisma.dealLogEntry.create({
    data: { dealId, authorId: session.user.id, authorRole: session.user.role, message },
  })

  await notifyUsers([
    { userId: deal.buyerId, title: 'Deal update', message },
    { userId: deal.sellerId, title: 'Deal update', message },
  ])

  revalidatePath(`/dashboard/deals/${dealId}`)
}

const REQUIRED_FROM = ['BUYER', 'SELLER', 'EITHER'] as const

/** Adds a checklist item to the deal's document requirements — e.g. "Sale
 *  deed", "NOC" — and notifies whoever it's required from. Buyers/sellers
 *  fulfill these from the public API on their own frontend (this internal
 *  dashboard is staff/agent-only); staff only defines and reviews them. */
export async function addDealDocument(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const docType = String(formData.get('docType') || '').trim()
  const requiredFrom = String(formData.get('requiredFrom') || '').toUpperCase()
  const remarks = String(formData.get('remarks') || '').trim()
  if (!docType) throw new Error('Document name is required')
  if (!REQUIRED_FROM.includes(requiredFrom as (typeof REQUIRED_FROM)[number])) {
    throw new Error(`requiredFrom must be one of: ${REQUIRED_FROM.join(', ')}`)
  }

  const deal = await requireDealStaff(dealId, session)

  await prisma.dealDocument.create({
    data: {
      dealId,
      docType,
      requiredFrom,
      // Ownership decides who may read the file; recorded now so it holds even
      // before anything is uploaded. EITHER has no single owner until upload.
      ownerId: requiredFrom === 'BUYER' ? deal.buyerId : requiredFrom === 'SELLER' ? deal.sellerId : null,
      status: 'PENDING',
      remarks: remarks || null,
    },
  })

  const recipients =
    requiredFrom === 'BUYER' ? [deal.buyerId] : requiredFrom === 'SELLER' ? [deal.sellerId] : [deal.buyerId, deal.sellerId]
  await notifyUsers(
    recipients.map((userId) => ({
      userId,
      title: 'Document required',
      message: `"${docType}" is needed to close your deal — upload it when ready.`,
    }))
  )

  revalidatePath(`/dashboard/deals/${dealId}`)
}

/** Corrects a document requirement that was raised wrong — misspelled name,
 *  asked of the wrong party, or missing instructions. Editing the requirement
 *  deliberately does not touch an upload that already happened; use the review
 *  action to reject that if it's no longer the right file. */
export async function updateDealDocumentRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const docId = String(formData.get('docId'))
  const docType = String(formData.get('docType') || '').trim()
  const requiredFrom = String(formData.get('requiredFrom') || '').toUpperCase()
  const remarks = String(formData.get('remarks') || '').trim()

  if (!docType) throw new Error('Document name is required')
  if (!REQUIRED_FROM.includes(requiredFrom as (typeof REQUIRED_FROM)[number])) {
    throw new Error(`requiredFrom must be one of: ${REQUIRED_FROM.join(', ')}`)
  }

  await requireDealStaff(dealId, session)

  const document = await prisma.dealDocument.findUnique({ where: { id: docId } })
  if (!document || document.dealId !== dealId) throw new Error('Document not found')

  await prisma.dealDocument.update({
    where: { id: docId },
    data: { docType, requiredFrom, remarks: remarks || null },
  })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
}

/** Removes a requirement raised in error. Only while nothing has been uploaded
 *  against it — once a party has supplied a file, reject it instead so the
 *  audit trail of what was asked and answered stays intact. */
export async function deleteDealDocumentRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const docId = String(formData.get('docId'))

  await requireDealStaff(dealId, session)

  const document = await prisma.dealDocument.findUnique({ where: { id: docId } })
  if (!document || document.dealId !== dealId) throw new Error('Document not found')
  if (document.fileUrl) throw new Error('This document has already been uploaded — reject it instead of deleting it')

  await prisma.dealDocument.delete({ where: { id: docId } })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
}

/** Staff review of an uploaded document. Neither buyer nor seller can
 *  approve their own upload — review is staff/agent-only, same trust
 *  boundary as every other verification step on this platform. */
export async function reviewDealDocument(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const docId = String(formData.get('docId'))
  const status = String(formData.get('status') || '').toUpperCase()
  const remarks = String(formData.get('remarks') || '').trim()
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new Error('Invalid review status')
  // A rejection with no reason leaves the uploader guessing, so they just
  // re-upload the same file.
  if (status === 'REJECTED' && !remarks) {
    throw new Error('Add a reason when rejecting a document — say what needs fixing')
  }

  const deal = await requireDealStaff(dealId, session)

  const document = await prisma.dealDocument.findUnique({ where: { id: docId } })
  if (!document || document.dealId !== dealId) throw new Error('Document not found')
  if (document.status !== 'UPLOADED') throw new Error('Document must be uploaded before it can be reviewed')

  await prisma.dealDocument.update({
    where: { id: docId },
    data: { status, remarks: remarks || null },
  })

  await notifyUsers([
    {
      userId: document.uploadedBy ?? (document.requiredFrom === 'SELLER' ? deal.sellerId : deal.buyerId),
      title: status === 'APPROVED' ? 'Document approved' : 'Document rejected',
      message: `"${document.docType}" was ${status === 'APPROVED' ? 'approved' : 'rejected — please re-upload'}.`,
    },
  ])

  revalidatePath(`/dashboard/deals/${dealId}`)
}

export async function closeDeal(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const deal = await requireDealStaff(dealId, session)
  if (deal.status === 'CLOSED') throw new Error('This deal is already closed')

  // Every configured requirement, evaluated together so staff get the whole
  // remaining checklist rather than one blocker at a time.
  const gate = await evaluateClosureGate(dealId)
  if (!gate) throw new Error('Deal not found')
  if (!gate.canClose) throw new Error(gate.blockers.join('; '))

  const { commissionPercent } = await getAppConfig()
  const settlementAmount = deal.finalAmount ?? deal.agreedPrice
  const commissionAmount = Math.round(settlementAmount * (commissionPercent / 100) * 100) / 100

  await prisma.$transaction([
    prisma.deal.update({ where: { id: dealId }, data: { status: 'CLOSED', commissionAmount } }),
    prisma.property.update({ where: { id: deal.propertyId }, data: { status: 'CLOSED' } }),
  ])

  await recordAudit({
    action: 'DEAL_CLOSED',
    actorId: session.user.id,
    entity: 'Deal',
    entityId: dealId,
    meta: { commissionAmount, settlementAmount, requirements: gate.requirements },
  })

  await notifyUsers([
    { userId: deal.buyerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
    { userId: deal.sellerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
  ])

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}

/** Records that a deal fell through, and puts the property back on the market.
 *
 *  Deliberately not gated the way closure is: closure means money has moved and
 *  has a configurable checklist behind it, whereas a collapse is the opposite —
 *  the point is to let staff record reality quickly, the moment they hear it. */
export async function markDealFellThrough(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || !['AGENT', 'BACKEND', 'ADMIN'].includes(session.user.role)) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId') ?? '')
  if (!dealId) throw new Error('Missing deal')
  const failureCode = String(formData.get('failureCode') ?? '')
  const failureNote = String(formData.get('failureNote') ?? '')

  const result = await collapseDeal({
    dealId,
    failureCode,
    failureNote,
    actorId: session.user.id,
    actorRole: session.user.role,
  })

  if ('error' in result) {
    throw new Error(
      result.error === 'NOT_FOUND' ? 'Deal not found'
      : result.error === 'FORBIDDEN' ? 'This deal is assigned to another agent'
      : result.error === 'ALREADY_CLOSED' ? 'A closed deal cannot be marked as fallen through'
      : result.error === 'ALREADY_FAILED' ? 'This deal is already recorded as fallen through'
      : 'Select a valid reason'
    )
  }

  const { deal } = result
  const relistNote = deal.relisted ? ' The listing is live again.' : ''
  await notifyUsers([
    {
      userId: deal.buyerId,
      title: 'Deal did not go through',
      message: `Your deal on ${deal.propertyTitle} has been closed out as unsuccessful.`,
    },
    {
      userId: deal.sellerId,
      title: 'Deal did not go through',
      message: `The deal on ${deal.propertyTitle} did not complete.${relistNote}`,
    },
    ...(deal.agentId && deal.agentId !== session.user.id
      ? [{
          userId: deal.agentId,
          title: 'Deal marked as fallen through',
          message: `The deal you were handling on ${deal.propertyTitle} was recorded as unsuccessful.`,
        }]
      : []),
  ])

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard/listings')
  revalidatePath('/dashboard')
}

/** Moves a deal's displayed stage by hand (agent on their own deal, or backend/admin).
 *
 *  Both parties see this move, so the reason is stored and the change is logged
 *  — see DealStageChange. What can and can't be declared is decided in
 *  src/lib/data/dealProgress.ts, not here. */
export async function declareDealStageAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || !['AGENT', 'BACKEND', 'ADMIN'].includes(session.user.role)) throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId') ?? '')
  const target = String(formData.get('stage') ?? '')
  if (!dealId || !target) throw new Error('Missing deal or stage')

  const amountRaw = String(formData.get('agreedAmount') ?? '').trim()
  const result = await declareDealStage({
    dealId,
    target,
    reason: String(formData.get('reason') ?? ''),
    agreedAmount: amountRaw ? Number(amountRaw) : null,
    actorId: session.user.id,
    actorRole: session.user.role,
  })

  if ('error' in result) throw new Error(dealStageErrorMessage(result.error).message)

  // Only the parties who can see the bar move need telling, and only when it
  // moves backwards — a forward step is expected progress, a backward one is the
  // surprising event that erodes trust if it happens silently.
  if (result.direction === 'BACKWARD') {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { buyerId: true, sellerId: true, property: { select: { title: true } } },
    })
    if (deal) {
      const message = `The recorded stage for ${deal.property.title} was moved back to "${STAGE_LABELS[result.to]}".`
      await notifyUsers([
        { userId: deal.buyerId, title: 'Deal stage updated', message },
        { userId: deal.sellerId, title: 'Deal stage updated', message },
      ])
    }
  }

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath(`/dashboard/accepted-offers/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}
