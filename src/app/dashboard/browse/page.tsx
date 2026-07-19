import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import MakeOfferRow from '@/components/dashboard/MakeOfferRow'

const SORTS = {
  newest: { createdAt: 'desc' as const },
  price_high: { askingPrice: 'desc' as const },
  price_low: { askingPrice: 'asc' as const },
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; q?: string }>
}) {
  const { type, sort, q } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BUYER') redirect('/dashboard')

  const properties = await prisma.property.findMany({
    where: {
      status: 'LIVE',
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: SORTS[sort as keyof typeof SORTS] ?? SORTS.newest,
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Browse Properties" subtitle={`${properties.length} verified & live`} />

      <form className="mb-4 flex flex-wrap items-center gap-2 text-xs" data-animate="fade-up">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search title or location"
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
        <select name="type" defaultValue={type ?? ''} className="rounded-lg border px-3 py-2 outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}>
          <option value="">All types</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="PLOT">Plot</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
        <select name="sort" defaultValue={sort ?? 'newest'} className="rounded-lg border px-3 py-2 outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}>
          <option value="newest">Newest first</option>
          <option value="price_high">Price: high to low</option>
          <option value="price_low">Price: low to high</option>
        </select>
        <button type="submit" className="btn-accent rounded-lg px-3 py-2 font-semibold">Apply</button>
      </form>

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {properties.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No live listings match.</p>
        ) : (
          properties.map((p) => (
            <MakeOfferRow
              key={p.id}
              propertyId={p.id}
              title={p.title}
              location={p.location}
              askingPrice={p.askingPrice}
              detail={`${p.type}${p.bhk ? ` · ${p.bhk} BHK` : ''} · ${p.areaSqft} sqft`}
            />
          ))
        )}
      </div>
    </DashboardEntrance>
  )
}
