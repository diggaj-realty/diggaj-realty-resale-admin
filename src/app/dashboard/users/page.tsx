import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import UserActiveToggle from '@/components/dashboard/UserActiveToggle'

const ROLE_TONE: Record<string, { bg: string; text: string }> = {
  SELLER: { bg: 'var(--amber-50)', text: 'var(--amber-700)' },
  BUYER: { bg: 'var(--blue-50)', text: 'var(--blue-700)' },
  AGENT: { bg: 'var(--green-50)', text: 'var(--green-700)' },
  BACKEND: { bg: 'var(--purple-50)', text: 'var(--purple-700)' },
  ADMIN: { bg: 'var(--red-50)', text: 'var(--red-700)' },
}

export default async function UsersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <DashboardEntrance>
      <PageHeader title="All Users" subtitle={`${users.length} accounts`} />

      <div className="card overflow-hidden" data-animate="fade-up">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--text-1)' }}>{u.name}</td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: ROLE_TONE[u.role].bg, color: ROLE_TONE[u.role].text }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <UserActiveToggle userId={u.id} isActive={u.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardEntrance>
  )
}
