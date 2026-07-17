import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'

const DAY_MS = 24 * 60 * 60 * 1000

/** Buckets timestamps into the last N calendar days (oldest first) — used to build
 *  real, DB-derived trend series (source platform's charts were hardcoded mocks). */
function dailyCounts(dates: Date[], days = 7) {
  const buckets: { label: string; value: number }[] = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now.getTime() - i * DAY_MS)
    const dayEnd = new Date(dayStart.getTime() + DAY_MS)
    const count = dates.filter((d) => d >= dayStart && d < dayEnd).length
    buckets.push({ label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }), value: count })
  }
  return buckets
}

export interface StatMetric {
  label: string
  value: string
  hint: string
  tone: 'green' | 'gold' | 'purple' | 'blue' | 'red'
}

export interface PipelineItem {
  id: string
  title: string
  subtitle: string
  amountLabel: string
  status: string
  href?: string
}

export interface DashboardData {
  role: string
  stats: StatMetric[]
  performanceSeries: { label: string; value: number }[]
  performanceTitle: string
  items: PipelineItem[]
  itemsTitle: string
  emptyMessage: string
}

function statusTone(status: string): string {
  const s = status.toUpperCase()
  if (['LIVE', 'CLOSED', 'ACCEPTED', 'APPROVED'].includes(s)) return 'green'
  if (['PENDING_VERIFICATION', 'PENDING', 'PENDING_REVIEW', 'UNDER_REVIEW'].includes(s)) return 'gold'
  if (['IN_PROGRESS', 'COUNTERED'].includes(s)) return 'blue'
  if (['REJECTED'].includes(s)) return 'red'
  return 'purple'
}

/** Buyer/seller-facing offer status never distinguishes "awaiting backend triage"
 *  from "forwarded, awaiting seller" — both display as a plain "Pending". */
function buyerFacingOfferStatus(status: string): string {
  return status === 'PENDING_REVIEW' ? 'PENDING' : status
}

export { statusTone, buyerFacingOfferStatus }

export async function getSellerDashboard(userId: string): Promise<DashboardData & { kyc: { pending: boolean; rejected: boolean; approved: boolean; remarks: string | null } }> {
  const [kyc, properties, deals] = await Promise.all([
    prisma.sellerKyc.findUnique({ where: { userId } }),
    prisma.property.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.deal.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' }, take: 3, include: { property: { select: { title: true } } } }),
  ])

  const liveCount = properties.filter((p) => p.status === 'LIVE').length
  const pendingCount = properties.filter((p) => p.status === 'PENDING_VERIFICATION').length
  const activeDeals = deals.filter((d) => d.status === 'IN_PROGRESS').length
  const totalValue = properties.reduce((sum, p) => sum + p.askingPrice, 0)

  const offersOnMyProps = await prisma.offer.findMany({
    where: { property: { sellerId: userId } },
    select: { createdAt: true },
  })

  return {
    role: 'SELLER',
    kyc: {
      pending: !kyc || kyc.status === 'PENDING',
      rejected: kyc?.status === 'REJECTED',
      approved: kyc?.status === 'APPROVED',
      remarks: kyc?.remarks ?? null,
    },
    stats: [
      { label: 'Live Listings', value: String(liveCount), hint: 'Active on platform', tone: 'green' },
      { label: 'Under Verification', value: String(pendingCount), hint: 'Avg 2-3 business days', tone: 'gold' },
      { label: 'Active Deals', value: String(activeDeals), hint: 'In progress', tone: 'purple' },
      { label: 'Portfolio Value', value: formatINR(totalValue), hint: 'Total asking price', tone: 'green' },
    ],
    performanceTitle: 'Offers Received — Last 7 Days',
    performanceSeries: dailyCounts(offersOnMyProps.map((o) => o.createdAt)),
    itemsTitle: 'My Properties',
    emptyMessage: 'No listings yet.',
    items: properties.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.location,
      amountLabel: formatINR(p.askingPrice),
      status: p.status,
    })),
  }
}

export async function getBuyerDashboard(userId: string): Promise<DashboardData> {
  const [offers, deals, liveCount] = await Promise.all([
    prisma.offer.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { property: { select: { title: true, location: true, askingPrice: true } } },
    }),
    prisma.deal.findMany({ where: { buyerId: userId }, orderBy: { createdAt: 'desc' }, take: 3 }),
    prisma.property.count({ where: { status: 'LIVE' } }),
  ])

  const pendingOffers = offers.filter((o) => o.status === 'PENDING' || o.status === 'PENDING_REVIEW').length
  const acceptedOffers = offers.filter((o) => o.status === 'ACCEPTED').length
  const activeDeals = deals.filter((d) => d.status === 'IN_PROGRESS').length

  return {
    role: 'BUYER',
    stats: [
      { label: 'Pending Offers', value: String(pendingOffers), hint: 'Awaiting seller response', tone: 'gold' },
      { label: 'Accepted Offers', value: String(acceptedOffers), hint: 'Ready to proceed', tone: 'green' },
      { label: 'Active Deals', value: String(activeDeals), hint: 'In progress', tone: 'purple' },
      { label: 'Properties Available', value: String(liveCount), hint: 'Verified & live', tone: 'blue' },
    ],
    performanceTitle: 'Offers Made — Last 7 Days',
    performanceSeries: dailyCounts(offers.map((o) => o.createdAt), 7),
    itemsTitle: 'My Offers',
    emptyMessage: 'No offers yet. Browse verified listings and submit your first offer.',
    items: offers.map((o) => {
      const pct = Math.round((o.amount / o.property.askingPrice) * 100)
      return {
        id: o.id,
        title: o.property.title,
        subtitle: `${o.property.location} · ${pct}% of asking`,
        amountLabel: formatINR(o.amount),
        status: buyerFacingOfferStatus(o.status),
      }
    }),
  }
}

export async function getAgentDashboard(agentId: string): Promise<DashboardData> {
  const [totalListings, totalDeals, closedDeals, unreadNotifs, agreementValueAgg, recentDeals] = await Promise.all([
    prisma.property.count({ where: { agentId } }),
    prisma.deal.count({ where: { agentId } }),
    prisma.deal.count({ where: { agentId, status: 'CLOSED' } }),
    prisma.notification.count({ where: { userId: agentId, isRead: false } }),
    prisma.deal.aggregate({ where: { agentId, status: 'CLOSED' }, _sum: { agreedPrice: true } }),
    prisma.deal.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { property: { select: { title: true, location: true } }, buyer: { select: { name: true } } },
    }),
  ])

  const activeDeals = totalDeals - closedDeals
  const closeRate = totalDeals > 0 ? Math.round((closedDeals / totalDeals) * 100) : 0
  const agreementValue = agreementValueAgg._sum.agreedPrice ?? 0

  const allAgentDeals = await prisma.deal.findMany({ where: { agentId }, select: { createdAt: true } })

  return {
    role: 'AGENT',
    stats: [
      { label: 'My Listings', value: String(totalListings), hint: 'Active on platform', tone: 'green' },
      { label: 'Active Deals', value: String(activeDeals), hint: 'In negotiation', tone: 'blue' },
      { label: 'Deals Closed', value: String(closedDeals), hint: 'Total closings', tone: 'gold' },
      { label: 'Agreement Value', value: agreementValue > 0 ? formatINR(agreementValue) : '₹0', hint: 'Total closed deals', tone: 'gold' },
      { label: 'Close Rate', value: `${closeRate}%`, hint: 'Conversion ratio', tone: 'purple' },
      { label: 'Unread Alerts', value: String(unreadNotifs), hint: 'Needs attention', tone: 'red' },
    ],
    performanceTitle: 'Deals — Last 7 Days',
    performanceSeries: dailyCounts(allAgentDeals.map((d) => d.createdAt)),
    itemsTitle: 'Recent Deal Pipeline',
    emptyMessage: 'No deals assigned yet. Deals will appear once an admin assigns them to you.',
    items: recentDeals.map((d) => ({
      id: d.id,
      title: d.property.title,
      subtitle: `${d.property.location} · Buyer: ${d.buyer.name}`,
      amountLabel: formatINR(d.agreedPrice),
      status: d.status,
      href: `/dashboard`,
    })),
  }
}

export async function getBackendDashboard(): Promise<DashboardData> {
  const [pendingKyc, totalKyc, draftListings, totalListings, recentKyc, approvedKyc] = await Promise.all([
    prisma.sellerKyc.count({ where: { status: 'PENDING' } }),
    prisma.sellerKyc.count(),
    prisma.property.count({ where: { status: 'DRAFT' } }),
    prisma.property.count(),
    prisma.sellerKyc.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.sellerKyc.count({ where: { status: 'APPROVED' } }),
  ])

  const approvalRate = totalKyc > 0 ? Math.round((approvedKyc / totalKyc) * 100) : 0
  const allKyc = await prisma.sellerKyc.findMany({ select: { createdAt: true } })

  return {
    role: 'BACKEND',
    stats: [
      { label: 'KYC Pending', value: String(pendingKyc), hint: 'Awaiting review', tone: 'gold' },
      { label: 'KYC Approved', value: String(approvedKyc), hint: `${approvalRate}% approval rate`, tone: 'green' },
      { label: 'Listings in Queue', value: String(draftListings), hint: 'Needs verification', tone: 'blue' },
      { label: 'Total Listings', value: String(totalListings), hint: 'All time', tone: 'purple' },
    ],
    performanceTitle: 'KYC Submissions — Last 7 Days',
    performanceSeries: dailyCounts(allKyc.map((k) => k.createdAt)),
    itemsTitle: 'Oldest KYC Submissions',
    emptyMessage: 'KYC queue is empty. All pending applications have been reviewed.',
    items: recentKyc.map((k) => ({
      id: k.id,
      title: k.user.name,
      subtitle: `${k.user.email} · ${k.idType}`,
      amountLabel: new Date(k.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      status: 'PENDING',
    })),
  }
}

export async function getAdminDashboard(): Promise<DashboardData> {
  const [totalUsers, totalListings, liveListings, totalDeals, closedDeals, pendingKyc, recentUsers, recentListings] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.property.count({ where: { status: 'LIVE' } }),
    prisma.deal.count(),
    prisma.deal.count({ where: { status: 'CLOSED' } }),
    prisma.sellerKyc.count({ where: { status: 'PENDING' } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, role: true, createdAt: true } }),
    prisma.property.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { seller: { select: { name: true } } } }),
  ])

  const valueResult = await prisma.property.aggregate({ _sum: { askingPrice: true }, where: { status: 'LIVE' } })
  const totalValue = valueResult._sum.askingPrice ?? 0
  const closeRate = totalDeals > 0 ? Math.round((closedDeals / totalDeals) * 100) : 0

  const allUsers = await prisma.user.findMany({ select: { createdAt: true } })

  return {
    role: 'ADMIN',
    stats: [
      { label: 'Total Users', value: String(totalUsers), hint: 'All roles', tone: 'blue' },
      { label: 'Live Listings', value: String(liveListings), hint: 'Verified & live', tone: 'green' },
      { label: 'Total Listings', value: String(totalListings), hint: 'All time', tone: 'gold' },
      { label: 'Deals Closed', value: `${closedDeals}/${totalDeals}`, hint: `${closeRate}% close rate`, tone: 'purple' },
      { label: 'Pending KYCs', value: String(pendingKyc), hint: 'Awaiting review', tone: 'red' },
      { label: 'Live Portfolio Value', value: formatINR(totalValue), hint: 'Sum of live listings', tone: 'green' },
    ],
    performanceTitle: 'New Users — Last 7 Days',
    performanceSeries: dailyCounts(allUsers.map((u) => u.createdAt)),
    itemsTitle: 'Recent Listings',
    emptyMessage: 'No listings yet.',
    items: recentListings.map((l) => ({
      id: l.id,
      title: l.title,
      subtitle: `${l.seller.name} · ${l.location}`,
      amountLabel: formatINR(l.askingPrice),
      status: l.status,
    })),
  }
}

export async function getRecentUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, role: true, isActive: true } })
}

export async function getNotificationsFeed(userId: string, take = 5) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take })
}
