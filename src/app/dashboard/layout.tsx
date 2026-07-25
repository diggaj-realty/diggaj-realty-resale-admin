import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id, name, email, role } = session.user

  // This dashboard is internal-only (Admin/Backend-ops/Agent). Buyers and
  // sellers use the public marketing site + API, never this UI — this guard
  // catches any session cookie issued before that restriction existed.
  if (role === 'BUYER' || role === 'SELLER') redirect('/login')

  const [unreadCount, user, notifications] = await Promise.all([
    prisma.notification.count({ where: { userId: id, isRead: false } }),
    prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } }),
    prisma.notification.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, title: true, message: true, isRead: true, createdAt: true },
    }),
  ])

  return (
    <DashboardShell
      userName={name ?? 'User'}
      role={role}
      userEmail={email ?? ''}
      unreadCount={unreadCount}
      avatarUrl={user?.avatarUrl ?? null}
      initialNotifications={notifications}
    >
      {children}
    </DashboardShell>
  )
}
