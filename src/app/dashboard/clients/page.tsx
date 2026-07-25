import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ExportButton from '@/components/dashboard/ExportButton'
import UserActiveToggle from '@/components/dashboard/UserActiveToggle'

const ROLE_TONE: Record<string, { bg: string; text: string }> = {
  SELLER: { bg: 'var(--amber-50)', text: 'var(--amber-700)' },
  BUYER: { bg: 'var(--blue-50)', text: 'var(--blue-700)' },
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>
}) {
  const { q, role: roleFilter } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'BACKEND'].includes(session.user.role)) redirect('/dashboard')
  const canToggle = session.user.role === 'ADMIN'

  const clients = await prisma.user.findMany({
    where: {
      role: { in: roleFilter && ['BUYER', 'SELLER'].includes(roleFilter) ? [roleFilter] : ['BUYER', 'SELLER'] },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { propertiesAsSeller: true, offersAsBuyer: true, dealsAsBuyer: true, dealsAsSeller: true } },
    },
  })

  return (
    <DashboardEntrance>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Clients" subtitle={`${clients.length} buyers & sellers`} />
        <ExportButton
          rows={clients.map((c) => ({
            title: c.name,
            subtitle: c.email,
            amountLabel: c.role,
            status: c.isActive ? 'ACTIVE' : 'INACTIVE',
          }))}
          filename="clients"
        />
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
          <option value="">Buyers & Sellers</option>
          <option value="BUYER">Buyers only</option>
          <option value="SELLER">Sellers only</option>
        </select>
        <button type="submit" className="btn-accent rounded-lg px-3 py-2 font-semibold">Apply</button>
      </form>

      <div className="card overflow-hidden" data-animate="fade-up">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Activity</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{c.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{c.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: ROLE_TONE[c.role]?.bg ?? 'var(--surface-3)', color: ROLE_TONE[c.role]?.text ?? 'var(--text-2)' }}
                    >
                      {c.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>
                    {c.role === 'SELLER'
                      ? `${c._count.propertiesAsSeller} listing${c._count.propertiesAsSeller === 1 ? '' : 's'} · ${c._count.dealsAsSeller} deal${c._count.dealsAsSeller === 1 ? '' : 's'}`
                      : `${c._count.offersAsBuyer} offer${c._count.offersAsBuyer === 1 ? '' : 's'} · ${c._count.dealsAsBuyer} deal${c._count.dealsAsBuyer === 1 ? '' : 's'}`}
                  </td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{formatRelativeTime(c.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    {canToggle ? (
                      <UserActiveToggle userId={c.id} isActive={c.isActive} />
                    ) : (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: c.isActive ? 'var(--green-50)' : 'var(--red-50)', color: c.isActive ? 'var(--green-700)' : 'var(--red-700)' }}
                      >
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
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
