import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import {
  getSellerDashboard,
  getBuyerDashboard,
  getAgentDashboard,
  getBackendDashboard,
  getAdminDashboard,
  getNotificationsFeed,
  type DashboardData,
} from '@/lib/data/dashboard'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ProfileSummaryCard from '@/components/dashboard/ProfileSummaryCard'
import PerformanceChartCard from '@/components/dashboard/PerformanceChartCard'
import CurrentItemsList from '@/components/dashboard/CurrentItemsList'
import MessagesFeed from '@/components/dashboard/MessagesFeed'
import UpgradeCard from '@/components/dashboard/UpgradeCard'
import KycBanner from '@/components/dashboard/KycBanner'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id, name, role } = session.user
  const userName = name ?? 'User'

  let data: DashboardData
  let kyc: { pending: boolean; rejected: boolean; approved: boolean; remarks: string | null } | null = null

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

  const notifications = await getNotificationsFeed(id)

  return (
    <DashboardEntrance>
      {kyc && !kyc.approved && <KycBanner rejected={kyc.rejected} remarks={kyc.remarks} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
            <ProfileSummaryCard userName={userName} role={role} stats={data.stats} />
            <PerformanceChartCard title={data.performanceTitle} series={data.performanceSeries} />
          </div>
          <CurrentItemsList title={data.itemsTitle} items={data.items} emptyMessage={data.emptyMessage} />
        </div>

        <div className="flex flex-col gap-6">
          <MessagesFeed notifications={notifications} />
          <UpgradeCard role={role} />
        </div>
      </div>
    </DashboardEntrance>
  )
}
