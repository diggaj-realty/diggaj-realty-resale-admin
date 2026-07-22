import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import AddListingForm from '@/components/dashboard/AddListingForm'
import { getActiveAmenityNames } from '@/lib/data/amenities'

export default async function NewListingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['SELLER', 'AGENT', 'ADMIN', 'BACKEND'].includes(session.user.role)) redirect('/dashboard')

  if (session.user.role === 'SELLER') {
    const kyc = await prisma.sellerKyc.findUnique({ where: { userId: session.user.id } })
    if (kyc?.status !== 'APPROVED') redirect('/dashboard/kyc')
  }

  const amenityOptions = await getActiveAmenityNames()

  return (
    <DashboardEntrance>
      <PageHeader title="Add Listing" subtitle="Publish a new property for backend verification." />
      <AddListingForm amenityOptions={amenityOptions} />
    </DashboardEntrance>
  )
}
