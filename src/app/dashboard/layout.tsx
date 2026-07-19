import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardChrome from '@/components/dashboard/DashboardChrome'
import Header from '@/components/dashboard/Header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id, name, email, role } = session.user

  const [unreadCount, user] = await Promise.all([
    prisma.notification.count({ where: { userId: id, isRead: false } }),
    prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } }),
  ])

  return (
    <DashboardChrome role={role}>
      <Header userName={name ?? 'User'} role={role} userEmail={email ?? ''} unreadCount={unreadCount} avatarUrl={user?.avatarUrl ?? null} />
      <main className="px-8 py-8">{children}</main>
    </DashboardChrome>
  )
}
