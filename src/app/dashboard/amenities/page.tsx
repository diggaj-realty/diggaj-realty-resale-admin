import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import { createAmenity, toggleAmenity, deleteAmenity } from '@/lib/actions/amenities'

export default async function AmenitiesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const amenities = await prisma.amenity.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })

  return (
    <DashboardEntrance>
      <PageHeader title="Amenities" subtitle={`${amenities.length} defined`} />

      <form action={createAmenity} className="card mb-4 flex flex-wrap items-end gap-2 p-4" data-animate="fade-up">
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Name</label>
          <input
            type="text"
            name="name"
            required
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Category (optional)</label>
          <input
            type="text"
            name="category"
            placeholder="e.g. Security, Recreation"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
          />
        </div>
        <button type="submit" className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold">Add amenity</button>
      </form>

      <div className="card overflow-hidden" data-animate="fade-up">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {amenities.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                  No amenities defined yet — listing forms show a built-in default checklist until you add some here.
                </td>
              </tr>
            ) : (
              amenities.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-3.5 font-semibold" style={{ color: 'var(--text-1)' }}>{a.name}</td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>{a.category ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{
                        background: a.active ? 'rgba(34,197,94,0.14)' : 'rgba(148,163,184,0.18)',
                        color: a.active ? '#15803d' : '#64748b',
                      }}
                    >
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <form action={toggleAmenity}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? 'false' : 'true'} />
                        <button type="submit" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}>
                          {a.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </form>
                      <form action={deleteAmenity}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--line)', color: '#e11d48' }}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardEntrance>
  )
}
