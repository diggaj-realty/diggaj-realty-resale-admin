import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import {
  getBuyerDashboard,
  getAgentDashboard,
  getBackendDashboard,
  getAdminDashboard,
  getFeaturedProperties,
  getRecentInterest,
  type DashboardData,
  type NeedsAttentionItem,
} from '@/lib/data/dashboard'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import DashboardOverviewHeader from '@/components/dashboard/DashboardOverviewHeader'
import DashboardHeroBanner from '@/components/dashboard/DashboardHeroBanner'
import StatTile from '@/components/dashboard/StatTile'
import PerformanceChartCard from '@/components/dashboard/PerformanceChartCard'
import QuickActionsCard from '@/components/dashboard/QuickActionsCard'
import TrendingInterestCard from '@/components/dashboard/TrendingInterestCard'
import PropertyLocationCard from '@/components/dashboard/PropertyLocationCard'
import ExplorePropertiesGrid, { type ExploreProperty } from '@/components/dashboard/ExplorePropertiesGrid'
import type { UserRole } from '@/types'

// NOTE: ROLE_CONFIG, dashboardDataPromise, etc. are still typed/keyed over the
// full UserRole union (including SELLER) even though SELLER can never reach
// this page (see dashboard/layout.tsx redirect) — UserRole is shared with
// api/v1 and other SELLER-facing surfaces, so it isn't narrowed here.
const ROLE_CONFIG: Record<UserRole, { primaryAction: { label: string; href: string }; viewHref: string; exploreTitle: string; heroEyebrow: string; heroCountLabel: string }> = {
  SELLER: { primaryAction: { label: 'Add Listing', href: '/dashboard/listings/new' }, viewHref: '/dashboard/listings', exploreTitle: 'My Properties', heroEyebrow: 'Property Management', heroCountLabel: 'Properties' },
  BUYER: { primaryAction: { label: 'Browse Properties', href: '/dashboard/browse' }, viewHref: '/dashboard/browse', exploreTitle: 'Available Properties', heroEyebrow: 'Property Management', heroCountLabel: 'Available' },
  AGENT: { primaryAction: { label: 'View Deals', href: '/dashboard/deals' }, viewHref: '/dashboard/listings', exploreTitle: 'My Listings', heroEyebrow: 'Property Management', heroCountLabel: 'Listings' },
  BACKEND: { primaryAction: { label: 'Review Queue', href: '/dashboard/queue' }, viewHref: '/dashboard/queue', exploreTitle: 'Awaiting Review', heroEyebrow: 'Property Management', heroCountLabel: 'In Queue' },
  ADMIN: { primaryAction: { label: 'Manage Users', href: '/dashboard/users' }, viewHref: '/dashboard/listings', exploreTitle: 'Recent Listings', heroEyebrow: 'Property Management', heroCountLabel: 'Listings' },
}

async function getExploreProperties(role: UserRole, userId: string): Promise<ExploreProperty[]> {
  // SELLER can never reach this page (dashboard/layout.tsx redirects it before
  // rendering), so no sellerId-scoped branch is needed here.
  const where =
    role === 'BUYER' ? { status: 'LIVE' }
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

  let needsAttention: NeedsAttentionItem[] | null = null

  // SELLER is excluded here — dashboard/layout.tsx redirects SELLER sessions
  // to /login before this page ever renders.
  const dashboardDataPromise: Promise<DashboardData> =
    role === 'BUYER' ? getBuyerDashboard(id)
    : role === 'AGENT' ? getAgentDashboard(id)
    : role === 'BACKEND' ? getBackendDashboard()
    : role === 'ADMIN' ? getAdminDashboard()
    : (redirect('/login') as never)

  const [data, properties, featured, interest] = await Promise.all([
    dashboardDataPromise,
    getExploreProperties(role, id),
    getFeaturedProperties(role, id),
    getRecentInterest(role, id),
  ])

  if (role === 'AGENT') needsAttention = (data as Awaited<ReturnType<typeof getAgentDashboard>>).needsAttention
  const config = ROLE_CONFIG[role]
  const spark = data.performanceSeries.map((p) => p.value)

  return (
    <DashboardEntrance>
      <DashboardOverviewHeader
        exportRows={data.items}
        exportFilename={`${role.toLowerCase()}-overview`}
        primaryAction={config.primaryAction}
      />

      {featured && (
        <DashboardHeroBanner
          eyebrow={config.heroEyebrow}
          title={featured.title}
          photoUrl={featured.heroPhotoUrl}
          status={featured.status}
        />
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.slice(0, 4).map((stat) => (
          <StatTile key={stat.label} stat={stat} spark={spark} />
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <QuickActionsCard role={role} />
        {featured ? (
          <PropertyLocationCard
            code={featured.code}
            location={featured.location}
            latitude={featured.latitude}
            longitude={featured.longitude}
            count={featured.count}
          />
        ) : (
          <PerformanceChartCard title={data.performanceTitle} series={data.performanceSeries} />
        )}
        <TrendingInterestCard data={interest} />
      </div>

      {featured && (
        <div className="mb-6">
          <PerformanceChartCard title={data.performanceTitle} series={data.performanceSeries} />
        </div>
      )}

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
