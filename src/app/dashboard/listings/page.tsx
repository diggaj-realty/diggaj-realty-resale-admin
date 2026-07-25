import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { MapPin, BedDouble, Ruler, Eye, Tag, ImageOff, User2 } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusPill from '@/components/dashboard/StatusPill'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ExportButton from '@/components/dashboard/ExportButton'
import DeleteListingButton from '@/components/dashboard/DeleteListingButton'
import CompletenessBadge from '@/components/dashboard/CompletenessBadge'
import { listingCompletenessScore } from '@/lib/data/propertyFields'

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

  // SELLER is excluded — dashboard/layout.tsx already redirects SELLER
  // sessions before this page renders.
  if (!['AGENT', 'ADMIN', 'BACKEND'].includes(role)) redirect('/dashboard')

  const where = {
    ...(role === 'AGENT' ? { agentId: id } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { location: { contains: q, mode: 'insensitive' as const } }] } : {}),
  }

  const orderBy = SORTS[sort as keyof typeof SORTS] ?? SORTS.newest

  const properties = await prisma.property.findMany({
    where,
    orderBy,
    include: {
      seller: { select: { name: true, role: true } },
      agent: { select: { name: true } },
      photos: { where: { mediaType: 'IMAGE' }, orderBy: { order: 'asc' }, select: { photoUrl: true } },
    },
  })

  const title = role === 'AGENT' ? 'My Listings' : 'All Listings'

  return (
    <DashboardEntrance>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={title} subtitle={`${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`} />
        <div className="flex items-center gap-2">
          <Link href="/dashboard/listings/new" className="btn-accent rounded-lg px-3 py-2 text-xs font-semibold">
            Add Listing
          </Link>
          <ExportButton
            rows={properties.map((p) => ({
              title: p.title,
              subtitle: `${p.location} · ${p.type} · ${p.seller.role === 'SELLER' ? `Seller: ${p.seller.name}` : `Uploaded by Backend: ${p.seller.name}`}${p.agent ? ` · Agent: ${p.agent.name}` : ''}`,
              amountLabel: formatINR(p.askingPrice),
              status: p.status,
            }))}
            filename="listings"
          />
        </div>
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

      {properties.length === 0 ? (
        <div className="card" data-animate="fade-up">
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>No properties found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-animate="fade-up">
          {properties.map((p) => {
            const photoUrl = p.photos[0]?.photoUrl ?? null
            const backendName = p.seller.role !== 'SELLER' ? p.seller.name : null
            const sellerName = p.seller.role === 'SELLER' ? p.seller.name : null
            return (
              <div
                key={p.id}
                className="card card-hover flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                {/* Thumbnail */}
                <Link
                  href={`/dashboard/listings/${p.id}`}
                  className="relative h-40 w-full flex-shrink-0 overflow-hidden rounded-[var(--radius-md)] sm:h-24 sm:w-32"
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, var(--accent-50), var(--surface-2))' }}
                    >
                      <ImageOff size={20} style={{ color: 'var(--accent-500)' }} />
                    </div>
                  )}
                </Link>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/listings/${p.id}`}
                        className="truncate text-sm font-bold hover:underline"
                        style={{ color: 'var(--text-1)' }}
                      >
                        {p.title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                        <MapPin size={11} className="flex-shrink-0" /> {p.location}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(p.askingPrice)}</p>
                      <StatusPill status={p.status} />
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      <Tag size={11} /> {p.type}
                    </span>
                    {p.bhk != null && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                      >
                        <BedDouble size={11} /> {p.bhk} BHK
                      </span>
                    )}
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      <Ruler size={11} /> {p.areaSqft} sqft
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      <Eye size={11} /> {p.viewCount} views
                    </span>
                    <CompletenessBadge
                      score={listingCompletenessScore({
                        description: p.description,
                        city: p.city,
                        locality: p.locality,
                        carpetAreaSqft: p.carpetAreaSqft,
                        bathrooms: p.bathrooms,
                        furnishing: p.furnishing,
                        facing: p.facing,
                        possessionStatus: p.possessionStatus,
                        ownershipType: p.ownershipType,
                        reraId: p.reraId,
                        amenities: p.amenities,
                        photoCount: p.photos.length,
                        floorPlanUrl: p.floorPlanUrl,
                        videoUrl: p.videoUrl,
                      })}
                    />
                    {sellerName && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                      >
                        <User2 size={11} /> Seller: {sellerName}
                      </span>
                    )}
                    {(role === 'ADMIN' || role === 'BACKEND') && backendName && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}
                      >
                        <User2 size={11} /> Uploaded by: {backendName}
                      </span>
                    )}
                    {role !== 'AGENT' && p.agent?.name && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                      >
                        <User2 size={11} /> Agent: {p.agent.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {(role === 'ADMIN' || role === 'BACKEND') && (
                  <div className="flex flex-shrink-0 justify-end sm:justify-center">
                    <DeleteListingButton propertyId={p.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </DashboardEntrance>
  )
}
