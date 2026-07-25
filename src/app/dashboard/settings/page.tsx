import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ProfileForm from '@/components/dashboard/ProfileForm'
import PasswordChangeForm from '@/components/dashboard/PasswordChangeForm'
import PlatformSettingsForm from '@/components/dashboard/PlatformSettingsForm'
import NotificationPrefsForm from '@/components/dashboard/NotificationPrefsForm'
import { ROLE_LABELS } from '@/components/dashboard/navConfig'
import { getAppConfig } from '@/lib/actions/appConfig'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) redirect('/login')

  const appConfig = session.user.role === 'ADMIN' ? await getAppConfig() : null

  const memberSince = user.createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <DashboardEntrance>
      <PageHeader title="Settings" subtitle={`${ROLE_LABELS[session.user.role]} account`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileForm name={user.name} phone={user.phone} email={user.email} avatarUrl={user.avatarUrl} />
          <NotificationPrefsForm emailNotifications={user.emailNotifications} pushNotifications={user.pushNotifications} />
          <PasswordChangeForm />
          {appConfig && (
            <PlatformSettingsForm
              commissionPercent={appConfig.commissionPercent}
              kycAutoApproveEnabled={appConfig.kycAutoApproveEnabled}
              listingApprovalRequired={appConfig.listingApprovalRequired}
              supportEmail={appConfig.supportEmail}
            />
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="card p-6" data-animate="fade-up">
            <h2 className="mb-5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Account summary</h2>

            <div className="mb-4 flex items-center gap-3">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-14 w-14 rounded-full border object-cover"
                  style={{ borderColor: 'var(--line)' }}
                />
              ) : (
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: 'var(--accent-gradient)' }}
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{user.name}</p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                  <Mail size={12} className="flex-shrink-0" />
                  <span className="truncate">{user.email}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
              >
                {ROLE_LABELS[session.user.role]}
              </span>
            </div>

            <p className="mt-4 border-t pt-4 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--text-3)' }}>
              Member since {memberSince}
            </p>
          </div>
        </div>
      </div>
    </DashboardEntrance>
  )
}
