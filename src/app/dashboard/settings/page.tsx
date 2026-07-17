import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ProfileForm from '@/components/dashboard/ProfileForm'
import PasswordChangeForm from '@/components/dashboard/PasswordChangeForm'
import { ROLE_LABELS } from '@/components/dashboard/navConfig'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) redirect('/login')

  return (
    <DashboardEntrance>
      <PageHeader title="Settings" subtitle={`${ROLE_LABELS[session.user.role]} account`} />
      <div className="flex flex-col gap-6">
        <ProfileForm name={user.name} phone={user.phone} email={user.email} />
        <PasswordChangeForm />
      </div>
    </DashboardEntrance>
  )
}
