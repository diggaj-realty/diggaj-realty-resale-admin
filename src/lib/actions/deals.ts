'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import { getAppConfig } from '@/lib/actions/appConfig'

async function requireAssignedAgent(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } })
  if (!deal) throw new Error('Deal not found')
  if (deal.agentId !== userId) throw new Error('Unauthorized')
  return deal
}

export async function recordTokenPayment(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'AGENT') throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const tokenAmount = Number(formData.get('tokenAmount'))
  const tokenDateRaw = String(formData.get('tokenDate') || '')
  if (!tokenAmount || tokenAmount <= 0) throw new Error('Enter a valid token amount')
  if (!tokenDateRaw) throw new Error('Token date is required')

  await requireAssignedAgent(dealId, session.user.id)

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
  if (!session || session.user.role !== 'AGENT') throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const finalAmount = Number(formData.get('finalAmount'))
  const finalPaymentDateRaw = String(formData.get('finalPaymentDate') || '')
  const paymentMode = String(formData.get('paymentMode') || '')
  const transactionRef = String(formData.get('transactionRef') || '').trim()

  if (!finalAmount || finalAmount <= 0) throw new Error('Enter a valid final amount')
  if (!finalPaymentDateRaw) throw new Error('Final payment date is required')
  if (!['BANK_TRANSFER', 'CHEQUE', 'OTHER'].includes(paymentMode)) throw new Error('Invalid payment mode')

  await requireAssignedAgent(dealId, session.user.id)

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
  if (!session || session.user.role !== 'AGENT') throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))
  const notes = String(formData.get('notes') || '').trim()

  await requireAssignedAgent(dealId, session.user.id)

  await prisma.deal.update({
    where: { id: dealId },
    data: { notes: notes || null },
  })

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
}

export async function closeDeal(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'AGENT') throw new Error('Unauthorized')

  const dealId = String(formData.get('dealId'))

  const deal = await requireAssignedAgent(dealId, session.user.id)
  if (!deal.finalPaymentDate) throw new Error('Record the final payment before closing the deal')

  const { commissionPercent } = await getAppConfig()
  const settlementAmount = deal.finalAmount ?? deal.agreedPrice
  const commissionAmount = Math.round(settlementAmount * (commissionPercent / 100) * 100) / 100

  await prisma.$transaction([
    prisma.deal.update({ where: { id: dealId }, data: { status: 'CLOSED', commissionAmount } }),
    prisma.property.update({ where: { id: deal.propertyId }, data: { status: 'CLOSED' } }),
  ])

  await notifyUsers([
    { userId: deal.buyerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
    { userId: deal.sellerId, title: 'Deal closed', message: 'Your deal has been marked closed.' },
  ])

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard')
}
