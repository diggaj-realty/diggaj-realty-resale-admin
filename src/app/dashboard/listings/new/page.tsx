import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import AddListingForm from '@/components/dashboard/AddListingForm'
import { getActiveAmenityNames } from '@/lib/data/amenities'

export default async function NewListingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  // SELLER is excluded from the allowlist — dashboard/layout.tsx already
  // redirects SELLER sessions before any dashboard page (including this one)
  // renders, so the KYC gate that used to run for SELLER here is unreachable.
  if (!['AGENT', 'ADMIN', 'BACKEND'].includes(session.user.role)) redirect('/dashboard')

  const amenityOptions = await getActiveAmenityNames()

  return (
    <DashboardEntrance>
      <PageHeader title="Add Listing" subtitle="Publish a new property for backend verification." />
      <AddListingForm amenityOptions={amenityOptions} />
    </DashboardEntrance>
  )
}
