import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import {
  getSellerDashboard,
  getBuyerDashboard,
  getAgentDashboard,
  getBackendDashboard,
  getAdminDashboard,
  type DashboardData,
} from '@/lib/data/dashboard'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import PerformanceChartCard from '@/components/dashboard/PerformanceChartCard'
import StatTile from '@/components/dashboard/StatTile'
import StatusBreakdownChart from '@/components/dashboard/StatusBreakdownChart'

export default async function PerformancePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  let data: DashboardData
  switch (role) {
    case 'SELLER':
      data = await getSellerDashboard(id)
      break
    case 'BUYER':
      data = await getBuyerDashboard(id)
      break
    case 'AGENT':
      data = await getAgentDashboard(id)
      break
    case 'BACKEND':
      data = await getBackendDashboard()
      break
    case 'ADMIN':
      data = await getAdminDashboard()
      break
    default:
      redirect('/login')
  }

  return (
    <DashboardEntrance>
      <PageHeader title="Performance" subtitle="Deeper look at your metrics and trends" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {data.stats.map((s) => (
          <StatTile key={s.label} stat={s} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChartCard title={data.performanceTitle} series={data.performanceSeries} />
        </div>
        <div className="card p-6" data-animate="fade-up">
          <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Status Breakdown</h2>
          <StatusBreakdownChart items={data.items} />
        </div>
      </div>
    </DashboardEntrance>
  )
}
