import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import {
  getSellerDashboard,
  getBuyerDashboard,
  getAgentDashboard,
  getBackendDashboard,
  getAdminDashboard,
  type DashboardData,
  type NeedsAttentionItem,
} from '@/lib/data/dashboard'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import DashboardOverviewHeader from '@/components/dashboard/DashboardOverviewHeader'
import StatTile from '@/components/dashboard/StatTile'
import PerformanceChartCard from '@/components/dashboard/PerformanceChartCard'
import StatusBreakdownChart from '@/components/dashboard/StatusBreakdownChart'
import ExplorePropertiesGrid, { type ExploreProperty } from '@/components/dashboard/ExplorePropertiesGrid'
import KycBanner from '@/components/dashboard/KycBanner'
import type { UserRole } from '@/types'

const ROLE_CONFIG: Record<UserRole, { primaryAction: { label: string; href: string }; viewHref: string; exploreTitle: string }> = {
  SELLER: { primaryAction: { label: 'Add Listing', href: '/dashboard/listings/new' }, viewHref: '/dashboard/listings', exploreTitle: 'My Properties' },
  BUYER: { primaryAction: { label: 'Browse Properties', href: '/dashboard/browse' }, viewHref: '/dashboard/browse', exploreTitle: 'Available Properties' },
  AGENT: { primaryAction: { label: 'View Deals', href: '/dashboard/deals' }, viewHref: '/dashboard/listings', exploreTitle: 'My Listings' },
  BACKEND: { primaryAction: { label: 'Review Queue', href: '/dashboard/queue' }, viewHref: '/dashboard/queue', exploreTitle: 'Awaiting Review' },
  ADMIN: { primaryAction: { label: 'Manage Users', href: '/dashboard/users' }, viewHref: '/dashboard/listings', exploreTitle: 'Recent Listings' },
}

async function getExploreProperties(role: UserRole, userId: string): Promise<ExploreProperty[]> {
  const where =
    role === 'SELLER' ? { sellerId: userId }
    : role === 'BUYER' ? { status: 'LIVE' }
    : role === 'AGENT' ? { agentId: userId }
    : role === 'BACKEND' ? { status: { in: ['DRAFT', 'PENDING_VERIFICATION'] } }
    : {} // ADMIN

  const orderBy = role === 'BACKEND' ? ({ createdAt: 'asc' } as const) : ({ createdAt: 'desc' } as const)

  const properties = await prisma.property.findMany({
    where,
    orderBy,
    take: 4,
    include: { photos: { where: { mediaType: 'IMAGE' }, orderBy: { order: 'asc' }, take: 1 } },
  })

  return properties.map((p) => ({
    id: p.id,
    title: p.title,
    location: p.location,
    askingPrice: p.askingPrice,
    type: p.type,
    bhk: p.bhk,
    areaSqft: p.areaSqft,
    status: p.status,
    photoUrl: p.photos[0]?.photoUrl ?? null,
  }))
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id, role } = session.user

  let data: DashboardData
  let kyc: { pending: boolean; rejected: boolean; approved: boolean; remarks: string | null } | null = null
  let needsAttention: NeedsAttentionItem[] | null = null

  switch (role) {
    case 'SELLER': {
      const result = await getSellerDashboard(id)
      data = result
      kyc = result.kyc
      break
    }
    case 'BUYER':
      data = await getBuyerDashboard(id)
      break
    case 'AGENT': {
      const result = await getAgentDashboard(id)
      data = result
      needsAttention = result.needsAttention
      break
    }
    case 'BACKEND':
      data = await getBackendDashboard()
      break
    case 'ADMIN':
      data = await getAdminDashboard()
      break
    default:
      redirect('/login')
  }

  const properties = await getExploreProperties(role, id)
  const config = ROLE_CONFIG[role]
  const spark = data.performanceSeries.map((p) => p.value)

  return (
    <DashboardEntrance>
      {kyc && !kyc.approved && <KycBanner rejected={kyc.rejected} remarks={kyc.remarks} />}

      <DashboardOverviewHeader
        exportRows={data.items}
        exportFilename={`${role.toLowerCase()}-overview`}
        primaryAction={config.primaryAction}
      />

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.slice(0, 4).map((stat) => (
          <StatTile key={stat.label} stat={stat} spark={spark} />
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6" data-animate="fade-up">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Status Analysis</h2>
          </div>
          <StatusBreakdownChart items={data.items} />
        </div>
        <div className="lg:col-span-2">
          <PerformanceChartCard title={data.performanceTitle} series={data.performanceSeries} />
        </div>
      </div>

      {needsAttention && needsAttention.length > 0 && (
        <div className="card mb-6 p-6" data-animate="fade-up">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: 'var(--red-700)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Needs Attention</h2>
          </div>
          <ul className="flex flex-col gap-2.5">
            {needsAttention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02]"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <span className="truncate font-semibold" style={{ color: 'var(--text-1)' }}>{item.title}</span>
                  <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-3)' }}>{item.subtitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ExplorePropertiesGrid title={config.exploreTitle} properties={properties} viewHref={config.viewHref} />
    </DashboardEntrance>
  )
}
