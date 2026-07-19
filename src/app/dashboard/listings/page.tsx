import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ExportButton from '@/components/dashboard/ExportButton'

const SORTS = {
  newest: { createdAt: 'desc' as const },
  oldest: { createdAt: 'asc' as const },
  price_high: { askingPrice: 'desc' as const },
  price_low: { askingPrice: 'asc' as const },
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; q?: string }>
}) {
  const { status, sort, q } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id, role } = session.user

  if (!['SELLER', 'AGENT', 'ADMIN'].includes(role)) redirect('/dashboard')

  const where = {
    ...(role === 'SELLER' ? { sellerId: id } : role === 'AGENT' ? { agentId: id } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { location: { contains: q, mode: 'insensitive' as const } }] } : {}),
  }

  const orderBy = SORTS[sort as keyof typeof SORTS] ?? SORTS.newest

  const properties = await prisma.property.findMany({
    where,
    orderBy,
    include: { seller: { select: { name: true } }, agent: { select: { name: true } } },
  })

  const title = role === 'SELLER' ? 'My Properties' : role === 'AGENT' ? 'My Listings' : 'All Listings'

  return (
    <DashboardEntrance>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title={title} subtitle={`${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`} />
        <ExportButton
          rows={properties.map((p) => ({
            title: p.title,
            subtitle: `${p.location} · ${p.type} · Seller: ${p.seller.name}${p.agent ? ` · Agent: ${p.agent.name}` : ''}`,
            amountLabel: formatINR(p.askingPrice),
            status: p.status,
          }))}
          filename="listings"
        />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2 text-xs" data-animate="fade-up">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search title or location"
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_VERIFICATION">Pending Verification</option>
          <option value="LIVE">Live</option>
          <option value="CLOSED">Closed</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select
          name="sort"
          defaultValue={sort ?? 'newest'}
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price_high">Price: high to low</option>
          <option value="price_low">Price: low to high</option>
        </select>
        <button type="submit" className="btn-accent rounded-lg px-3 py-2 font-semibold">Apply</button>
      </form>

      <div className="card overflow-hidden" data-animate="fade-up">
        {properties.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No properties found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-5 py-3">Property</th>
                  {role !== 'SELLER' && <th className="px-5 py-3">Seller</th>}
                  {role !== 'AGENT' && <th className="px-5 py-3">Agent</th>}
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id} className="border-t transition-colors hover:bg-black/[0.015]" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-3.5 font-semibold">
                      <Link href={`/dashboard/listings/${p.id}`} className="hover:underline" style={{ color: 'var(--text-1)' }}>{p.title}</Link>
                    </td>
                    {role !== 'SELLER' && <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.seller.name}</td>}
                    {role !== 'AGENT' && <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.agent?.name ?? '—'}</td>}
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.location}</td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--accent-700)' }}>{formatINR(p.askingPrice)}</td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{p.type}</td>
                    <td className="px-5 py-3.5"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardEntrance>
  )
}
