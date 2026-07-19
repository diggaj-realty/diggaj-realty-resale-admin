import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ReviewActions from '@/components/dashboard/ReviewActions'
import StatusPill from '@/components/dashboard/StatusPill'
import { reviewKyc } from '@/lib/actions/backend'

export default async function KycDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const kyc = await prisma.sellerKyc.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
  })
  if (!kyc) notFound()

  const properties = await prisma.property.findMany({
    where: { sellerId: kyc.userId },
    select: { id: true, title: true, status: true, askingPrice: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <DashboardEntrance>
      <Link href="/dashboard/kyc" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
        <ArrowLeft size={13} /> Back to KYC Queue
      </Link>
      <PageHeader title={kyc.user.name} subtitle={`KYC submission · ${kyc.idType}`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-animate="fade-up">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Documents</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>ID Document ({kyc.idType})</p>
              {kyc.idDocUrl ? (
                <a href={kyc.idDocUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kyc.idDocUrl} alt="ID document" className="w-full rounded-lg border object-cover" style={{ borderColor: 'var(--line)' }} />
                </a>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>Not provided</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Selfie</p>
              {kyc.selfieUrl ? (
                <a href={kyc.selfieUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kyc.selfieUrl} alt="Selfie" className="w-full rounded-lg border object-cover" style={{ borderColor: 'var(--line)' }} />
                </a>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>Not provided</p>
              )}
            </div>
          </div>

          {kyc.remarks && (
            <div className="mt-5 rounded-lg p-4 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
              <p className="font-semibold">Previous remarks</p>
              <p className="mt-1">{kyc.remarks}</p>
            </div>
          )}

          {kyc.status === 'PENDING' && (
            <div className="mt-6">
              <ReviewActions action={reviewKyc} hiddenFields={{ kycId: kyc.id }} />
            </div>
          )}
          {kyc.status !== 'PENDING' && (
            <div className="mt-6">
              <span
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={
                  kyc.status === 'APPROVED'
                    ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                    : { background: 'var(--red-50)', color: 'var(--red-700)' }
                }
              >
                {kyc.status === 'APPROVED' ? 'Approved' : 'Rejected'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Seller details</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Email</dt>
                <dd style={{ color: 'var(--text-1)' }}>{kyc.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Phone</dt>
                <dd style={{ color: 'var(--text-1)' }}>{kyc.user.phone ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Account created</dt>
                <dd style={{ color: 'var(--text-1)' }}>
                  {new Date(kyc.user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </dd>
              </div>
              <div>
                <dt className="text-xs" style={{ color: 'var(--text-3)' }}>Submitted</dt>
                <dd style={{ color: 'var(--text-1)' }}>
                  {new Date(kyc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Properties ({properties.length})</h2>
            {properties.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>No listings yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {properties.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/dashboard/listings/${p.id}`} className="truncate hover:underline" style={{ color: 'var(--text-1)' }}>
                      {p.title}
                    </Link>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardEntrance>
  )
}
