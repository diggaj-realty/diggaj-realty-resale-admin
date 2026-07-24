import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Phone, Mail, MapPin, Globe } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import { agingBucket } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'

/** Every listing submitted through the no-signup public intake link
 *  (list.diggajrealty.com / /embed/list-property) — grouped by the seller
 *  profile it created behind the scenes, so staff can see who came in through
 *  that link and everything they've listed in one place. These properties
 *  still flow through the exact same DRAFT -> queue -> LIVE review pipeline
 *  as any other listing (see /dashboard/queue) — this page is a read-only,
 *  submitter-centric view on top of that, not a separate approval path. */
export default async function PublicListingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'BACKEND'].includes(session.user.role)) redirect('/dashboard')

  const properties = await prisma.property.findMany({
    where: { isPublicSubmission: true },
    orderBy: { createdAt: 'desc' },
    include: {
      seller: { select: { id: true, name: true, email: true, phone: true, createdAt: true, isActive: true } },
    },
  })

  const profiles = new Map<
    string,
    { seller: (typeof properties)[number]['seller']; referralName: string | null; properties: typeof properties }
  >()
  for (const p of properties) {
    const existing = profiles.get(p.sellerId)
    if (existing) {
      existing.properties.push(p)
      if (!existing.referralName && p.referralName) existing.referralName = p.referralName
    } else {
      profiles.set(p.sellerId, { seller: p.seller, referralName: p.referralName, properties: [p] })
    }
  }
  const profileList = Array.from(profiles.values()).sort(
    (a, b) => b.seller.createdAt.getTime() - a.seller.createdAt.getTime()
  )

  return (
    <DashboardEntrance>
      <PageHeader
        title="Public Listings"
        subtitle={`${profileList.length} profile${profileList.length === 1 ? '' : 's'} · ${properties.length} listing${properties.length === 1 ? '' : 's'} via the public link`}
      />

      {profileList.length === 0 ? (
        <div className="card" data-animate="fade-up">
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            No public-link submissions yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-animate="fade-up">
          {profileList.map(({ seller, referralName, properties: props }) => {
            const { label: memberSince } = agingBucket(seller.createdAt)
            return (
              <div key={seller.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                      >
                        <Globe size={15} />
                      </span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{seller.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                          No account/KYC on file · submitted {memberSince.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                      {seller.phone && (
                        <span className="flex items-center gap-1"><Phone size={11} /> {seller.phone}</span>
                      )}
                      {!seller.email.endsWith('.diggajrealty.local') && (
                        <span className="flex items-center gap-1"><Mail size={11} /> {seller.email}</span>
                      )}
                      {referralName && <span>Referred by: <strong>{referralName}</strong></span>}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: seller.isActive ? 'var(--green-50)' : 'var(--red-50)',
                      color: seller.isActive ? 'var(--green-700)' : 'var(--red-700)',
                    }}
                  >
                    {seller.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {props.map((p) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/listings/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-black/[0.02]"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.title}</p>
                        <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
                          <MapPin size={10} /> {p.location}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(p.askingPrice)}</span>
                        <StatusPill status={p.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </DashboardEntrance>
  )
}
