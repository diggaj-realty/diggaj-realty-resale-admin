import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import UserActiveToggle from '@/components/dashboard/UserActiveToggle'
import ExportButton from '@/components/dashboard/ExportButton'
import CreateStaffUserForm from '@/components/dashboard/CreateStaffUserForm'
import ApproveUserForm from '@/components/dashboard/ApproveUserForm'

const ROLE_TONE: Record<string, { bg: string; text: string }> = {
  SELLER: { bg: 'var(--amber-50)', text: 'var(--amber-700)' },
  BUYER: { bg: 'var(--blue-50)', text: 'var(--blue-700)' },
  AGENT: { bg: 'var(--green-50)', text: 'var(--green-700)' },
  BACKEND: { bg: 'var(--purple-50)', text: 'var(--purple-700)' },
  ADMIN: { bg: 'var(--red-50)', text: 'var(--red-700)' },
  PENDING: { bg: 'var(--amber-50)', text: 'var(--amber-700)' },
}

const SORTS = {
  newest: { createdAt: 'desc' as const },
  oldest: { createdAt: 'asc' as const },
  name: { name: 'asc' as const },
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; sort?: string }>
}) {
  const { q, role: roleFilter, sort } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: SORTS[sort as keyof typeof SORTS] ?? SORTS.newest,
  })

  return (
    <DashboardEntrance>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="All Users" subtitle={`${users.length} accounts`} />
        <div className="flex items-center gap-2">
          <CreateStaffUserForm />
          <ExportButton
            rows={users.map((u) => ({
              title: u.name,
              subtitle: u.email,
              amountLabel: u.role,
              status: u.isActive ? 'ACTIVE' : 'INACTIVE',
            }))}
            filename="users"
          />
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2 text-xs" data-animate="fade-up">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name or email"
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
        <select name="role" defaultValue={roleFilter ?? ''} className="rounded-lg border px-3 py-2 outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}>
          <option value="">All roles</option>
          <option value="SELLER">Seller</option>
          <option value="BUYER">Buyer</option>
          <option value="AGENT">Agent</option>
          <option value="BACKEND">Backend</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select name="sort" defaultValue={sort ?? 'newest'} className="rounded-lg border px-3 py-2 outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A-Z</option>
        </select>
        <button type="submit" className="btn-accent rounded-lg px-3 py-2 font-semibold">Apply</button>
      </form>

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
                    {u.role === 'PENDING' ? (
                      <ApproveUserForm userId={u.id} />
                    ) : (
                      <UserActiveToggle userId={u.id} isActive={u.isActive} />
                    )}
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
