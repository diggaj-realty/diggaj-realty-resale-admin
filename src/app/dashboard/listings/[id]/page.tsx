import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import EditListingForm from '@/components/dashboard/EditListingForm'
import AssignAgentForm from '@/components/dashboard/AssignAgentForm'
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
      seller: { select: { id: true, name: true, email: true, phone: true } },
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

  const canEdit = property.sellerId === userId || property.agentId === userId || role === 'ADMIN'
  const canAssignAgent = role === 'ADMIN' || role === 'BACKEND'

  const agents = canAssignAgent
    ? await prisma.user.findMany({ where: { role: 'AGENT', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : []

  const viewStats = await getPropertyViewStats(id)
  const amenityOptions = canEdit ? await getActiveAmenityNames() : []

  return (
    <DashboardEntrance>
      <Link href="/dashboard/listings" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
        <ArrowLeft size={13} /> Back to Listings
      </Link>
      <PageHeader title={property.title} subtitle={property.location} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2" data-animate="fade-up">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <StatusPill status={property.status} />
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

          {property.photos.length > 0 && (
            <div className="card p-6">
              <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Photos ({property.photos.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {property.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={photo.id} src={photo.photoUrl} alt={property.title} className="aspect-square w-full rounded-lg border object-cover" style={{ borderColor: 'var(--line)' }} />
                ))}
              </div>
            </div>
          )}

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
                city: property.city,
                locality: property.locality,
                pincode: property.pincode,
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
          </div>

          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Seller</h2>
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
        </div>
      </div>
    </DashboardEntrance>
  )
}
