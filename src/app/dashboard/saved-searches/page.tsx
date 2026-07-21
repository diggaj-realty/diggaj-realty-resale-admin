import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Search, Bell, BellOff, Trash2 } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import { normalizeFilters, filtersToQuery, type PropertyFilters } from '@/lib/data/propertySearch'
import { deleteSavedSearch, toggleSavedSearchAlerts } from '@/lib/actions/savedSearches'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'

/** Human-readable one-liner describing what a saved search matches. */
function describe(f: PropertyFilters): string {
  const parts: string[] = []
  if (f.q) parts.push(`"${f.q}"`)
  if (f.type) parts.push(f.type)
  if (f.city) parts.push(`in ${f.city}`)
  if (f.minBhk) parts.push(`${f.minBhk}+ BHK`)
  if (f.minPrice || f.maxPrice) {
    parts.push([f.minPrice ? formatINR(f.minPrice) : null, f.maxPrice ? formatINR(f.maxPrice) : null].filter(Boolean).join(' – '))
  }
  return parts.length ? parts.join(' · ') : 'All live properties'
}

export default async function SavedSearchesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BUYER') redirect('/dashboard')

  const searches = await prisma.savedSearch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Saved Searches" subtitle={`${searches.length} saved`} />

      <div className="flex flex-col gap-2.5" data-animate="fade-up">
        {searches.length === 0 ? (
          <p className="card py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No saved searches yet. Apply filters on Browse and tap “Save search” to get alerts on new matches.
          </p>
        ) : (
          searches.map((s) => {
            const filters = normalizeFilters(s.filters as Record<string, unknown> | null)
            const query = filtersToQuery(filters)
            return (
              <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                    {s.name || describe(filters)}
                  </p>
                  {s.name && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>{describe(filters)}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/browse${query ? `?${query}` : ''}`}
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                  >
                    <Search size={13} /> View results
                  </Link>

                  <form action={toggleSavedSearchAlerts}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={s.alertsEnabled ? 'false' : 'true'} />
                    <button
                      type="submit"
                      title={s.alertsEnabled ? 'Alerts on — click to mute' : 'Alerts off — click to enable'}
                      className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"
                      style={{
                        borderColor: 'var(--line)',
                        color: s.alertsEnabled ? 'var(--accent-700)' : 'var(--text-3)',
                      }}
                    >
                      {s.alertsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                      {s.alertsEnabled ? 'Alerts on' : 'Alerts off'}
                    </button>
                  </form>

                  <form action={deleteSavedSearch}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      title="Delete saved search"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border"
                      style={{ borderColor: 'var(--line)', color: '#e11d48' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              </div>
            )
          })
        )}
      </div>
    </DashboardEntrance>
  )
}
