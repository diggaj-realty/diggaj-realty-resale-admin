import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Sidebar from '@/components/dashboard/Sidebar'
import Header from '@/components/dashboard/Header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id, name, email, role } = session.user

  const unreadCount = await prisma.notification.count({ where: { userId: id, isRead: false } })

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Sidebar role={role} />
      <div className="pl-[76px]">
        <Header userName={name ?? 'User'} role={role} userEmail={email ?? ''} unreadCount={unreadCount} />
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  )
}
