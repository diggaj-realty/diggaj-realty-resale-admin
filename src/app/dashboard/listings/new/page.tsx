import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import AddListingForm from '@/components/dashboard/AddListingForm'

export default async function NewListingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'SELLER' && session.user.role !== 'AGENT') redirect('/dashboard')

  if (session.user.role === 'SELLER') {
    const kyc = await prisma.sellerKyc.findUnique({ where: { userId: session.user.id } })
    if (kyc?.status !== 'APPROVED') redirect('/dashboard/kyc')
  }

  return (
    <DashboardEntrance>
      <PageHeader title="Add Listing" subtitle="Publish a new property for backend verification." />
      <AddListingForm />
    </DashboardEntrance>
  )
}
