import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Heart } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatPhone, telHref } from '@/lib/phone'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import EditListingForm from '@/components/dashboard/EditListingForm'
import AssignAgentForm from '@/components/dashboard/AssignAgentForm'
import PropertyPlanForm from '@/components/dashboard/PropertyPlanForm'
import MediaGallery from '@/components/dashboard/MediaGallery'
import ReviewActions from '@/components/dashboard/ReviewActions'
import DeleteListingButton from '@/components/dashboard/DeleteListingButton'
import { reviewListing } from '@/lib/actions/backend'
import { getPropertyViewStats } from '@/lib/data/propertyViews'
import { getActiveAmenityNames } from '@/lib/data/amenities'
import { Eye } from 'lucide-react'

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, email: true, phone: true, role: true } },
      agent: { select: { id: true, name: true, email: true, phone: true } },
      photos: { orderBy: { order: 'asc' } },
    },
  })


  if (!property) notFound()

  const { role, id: userId } = session.user
  const canView =
    role === 'ADMIN' ||
    role === 'BACKEND' ||
    property.sellerId === userId ||
    property.agentId === userId
  if (!canView) redirect('/dashboard')

  const canEdit = property.sellerId === userId || property.agentId === userId || role === 'ADMIN' || role === 'BACKEND'
  const canAssignAgent = role === 'ADMIN' || role === 'BACKEND'
  const canReview = (role === 'ADMIN' || role === 'BACKEND') && ['DRAFT', 'PENDING_VERIFICATION'].includes(property.status)

  // Who saved this listing, and whether they ever went further.
  //
  // A save is a silent bookmark — no lead, no notification — so a listing with a
  // dozen saves and no enquiries was indistinguishable from one nobody had
  // opened. These are real, warm buyers, and staff had no way to see them.
  // Staff and the listing's agent only. This page is also visible to the seller,
  // and the platform deliberately brokers buyer contact through the agent rather
  // than handing over names and numbers — the leads API strips buyer contact for
  // sellers for the same reason.
  const canSeeSavers = role === 'ADMIN' || role === 'BACKEND' || property.agentId === userId
  const savers = !canSeeSavers ? [] : await prisma.shortlist.findMany({
    where: { propertyId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { id: true, name: true, phone: true } } },
  })
  const saverInterests = savers.length === 0 ? [] : await prisma.propertyInterest.findMany({
    where: { propertyId: id, buyerId: { in: savers.map((x) => x.userId) } },
    select: { buyerId: true },
  })
  const enquiredBuyerIds = new Set(saverInterests.map((x) => x.buyerId))

  const agents = canAssignAgent
    ? await prisma.user.findMany({ where: { role: 'AGENT', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : []

  const viewStats = await getPropertyViewStats(id)
  const amenityOptions = canEdit ? await getActiveAmenityNames() : []

  return (
    <DashboardEntrance>
      <div className="mb-3 flex items-center justify-between">
        <Link href="/dashboard/listings" className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
          <ArrowLeft size={13} /> Back to Listings
        </Link>
        {canEdit && <DeleteListingButton propertyId={property.id} />}
      </div>
      <PageHeader title={property.title} subtitle={property.location} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2" data-animate="fade-up">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusPill status={property.status} />
                {canReview && (
                  <ReviewActions
                    action={reviewListing}
                    hiddenFields={{ propertyId: property.id }}
                    approveValue="LIVE"
                    approveLabel="Approve"
                    rejectLabel="Reject"
                  />
                )}
              </div>
              <span className="text-lg font-bold" style={{ color: 'var(--accent-700)' }}>{formatINR(property.askingPrice)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Type</dt>
                <dd style={{ color: 'var(--text-1)' }}>{property.type}</dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Area</dt>
                <dd style={{ color: 'var(--text-1)' }}>{property.areaSqft} sqft</dd>
              </div>
              {property.bhk != null && (
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-3)' }}>BHK</dt>
                  <dd style={{ color: 'var(--text-1)' }}>{property.bhk}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Units Available</dt>
                <dd style={{ color: 'var(--text-1)' }}>{property.unitsAvailable}</dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Listed</dt>
                <dd style={{ color: 'var(--text-1)' }}>
                  {new Date(property.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </dd>
              </div>
              {property.verifiedAt && (
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Verified</dt>
                  <dd style={{ color: 'var(--text-1)' }}>
                    {new Date(property.verifiedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </dd>
                </div>
              )}
            </dl>
            {property.description && (
              <p className="mt-4 text-sm" style={{ color: 'var(--text-2)' }}>{property.description}</p>
            )}
          </div>

          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Media ({property.photos.length})</h2>
            <MediaGallery photos={property.photos} canEdit={canEdit} />
          </div>

          {canEdit && (
            <EditListingForm
              propertyId={property.id}
              amenityOptions={amenityOptions}
              initial={{
                title: property.title,
                description: property.description,
                location: property.location,
                type: property.type,
                areaSqft: property.areaSqft,
                bhk: property.bhk,
                askingPrice: property.askingPrice,
                unitsAvailable: property.unitsAvailable,
                city: property.city,
                locality: property.locality,
                pincode: property.pincode,
                latitude: property.latitude,
                longitude: property.longitude,
                carpetAreaSqft: property.carpetAreaSqft,
                builtUpAreaSqft: property.builtUpAreaSqft,
                superBuiltUpAreaSqft: property.superBuiltUpAreaSqft,
                bathrooms: property.bathrooms,
                balconies: property.balconies,
                furnishing: property.furnishing,
                facing: property.facing,
                floorNumber: property.floorNumber,
                totalFloors: property.totalFloors,
                ageYears: property.ageYears,
                parkingCovered: property.parkingCovered,
                parkingOpen: property.parkingOpen,
                possessionStatus: property.possessionStatus,
                possessionDate: property.possessionDate,
                ownershipType: property.ownershipType,
                reraId: property.reraId,
                priceNegotiable: property.priceNegotiable,
                maintenanceMonthly: property.maintenanceMonthly,
                amenities: property.amenities,
                builderName: property.builderName,
                projectName: property.projectName,
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-6" data-animate="fade-up">
          <div className="card p-6">
            <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <Eye size={15} /> Engagement
            </h2>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div>
                <dd className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{viewStats.total}</dd>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Total views</dt>
              </div>
              <div>
                <dd className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{viewStats.uniqueViewers}</dd>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Unique</dt>
              </div>
              <div>
                <dd className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{viewStats.last7Days}</dd>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Last 7d</dt>
              </div>
            </dl>

            {savers.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                  <Heart size={12} /> Saved by {savers.length} buyer{savers.length === 1 ? '' : 's'}
                </p>
                <ul className="flex flex-col gap-1">
                  {savers.map((sv) => {
                    const enquired = enquiredBuyerIds.has(sv.userId)
                    return (
                      <li key={sv.id} className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                        <span>{sv.user.name}</span>
                        {/* Saved but never enquired is the case worth chasing:
                            genuine interest that never became a lead. */}
                        {enquired ? (
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
                            enquired
                          </span>
                        ) : (
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                            no enquiry
                          </span>
                        )}
                        {telHref(sv.user.phone) && (
                          <a href={telHref(sv.user.phone)!} className="font-semibold" style={{ color: 'var(--accent-700)' }}>
                            {formatPhone(sv.user.phone)}
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {property.seller.role === 'SELLER' ? 'Seller' : 'Uploaded by Backend'}
            </h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Name</dt>
                <dd style={{ color: 'var(--text-1)' }}>{property.seller.name}</dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Email</dt>
                <dd style={{ color: 'var(--text-1)' }}>{property.seller.email}</dd>
              </div>
              {property.seller.phone && (
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Phone</dt>
                  <dd style={{ color: 'var(--text-1)' }}>{property.seller.phone}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Agent</h2>
            {property.agent ? (
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Name</dt>
                  <dd style={{ color: 'var(--text-1)' }}>{property.agent.name}</dd>
                </div>
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Email</dt>
                  <dd style={{ color: 'var(--text-1)' }}>{property.agent.email}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>No agent assigned.</p>
            )}
            {canAssignAgent && (
              <div className="mt-4">
                <AssignAgentForm propertyId={property.id} agents={agents} currentAgentId={property.agentId} />
              </div>
            )}
          </div>

          {canAssignAgent && (
            <div className="card p-6">
              <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Listing Plan</h2>
              <PropertyPlanForm propertyId={property.id} currentPlan={property.plan} requestedPlan={property.requestedPlan} />
            </div>
          )}
        </div>
      </div>
    </DashboardEntrance>
  )
}
