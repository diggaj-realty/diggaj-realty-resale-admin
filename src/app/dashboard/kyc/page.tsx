import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { ShieldCheck, Clock, ShieldAlert } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import ReviewActions from '@/components/dashboard/ReviewActions'
import KycSubmissionForm from '@/components/dashboard/KycSubmissionForm'
import { reviewKyc } from '@/lib/actions/backend'

export default async function KycPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  if (session.user.role === 'SELLER') {
    return <SellerKycView userId={session.user.id} />
  }

  if (session.user.role !== 'BACKEND') redirect('/dashboard')

  const pending = await prisma.sellerKyc.findMany({
    where: {
      status: 'PENDING',
      ...(q
        ? { user: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, email: true } } },
  })

  return (
    <DashboardEntrance>
      <PageHeader title="KYC Queue" subtitle={`${pending.length} pending submission${pending.length === 1 ? '' : 's'}`} />

      <form className="mb-4 flex flex-wrap items-center gap-2 text-xs" data-animate="fade-up">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search seller name or email"
          className="rounded-lg border px-3 py-2 outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
        <button type="submit" className="btn-accent rounded-lg px-3 py-2 font-semibold">Apply</button>
      </form>

      <div className="card overflow-hidden" data-animate="fade-up">
        {pending.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>All caught up — no pending KYC submissions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-5 py-3">Seller</th>
                  <th className="px-5 py-3">ID Type</th>
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((k) => (
                  <tr key={k.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/kyc/${k.id}`} className="font-semibold hover:underline" style={{ color: 'var(--text-1)' }}>
                        {k.user.name}
                      </Link>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{k.user.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                        {k.idType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'var(--text-2)' }}>
                      {new Date(k.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <ReviewActions action={reviewKyc} hiddenFields={{ kycId: k.id }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardEntrance>
  )
}

async function SellerKycView({ userId }: { userId: string }) {
  const kyc = await prisma.sellerKyc.findUnique({ where: { userId } })

  return (
    <DashboardEntrance>
      <PageHeader title="KYC Verification" subtitle="Verify your identity to unlock listing creation." />

      {!kyc && (
        <div className="space-y-6">
          <div className="card flex items-start gap-3 p-5" data-animate="fade-up" style={{ background: 'var(--amber-50)' }}>
            <ShieldAlert size={18} style={{ color: 'var(--amber-700)' }} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm" style={{ color: 'var(--amber-700)' }}>
              You haven&apos;t submitted your KYC yet. Submit your ID document and a selfie below to get verified.
            </p>
          </div>
          <KycSubmissionForm />
        </div>
      )}

      {kyc?.status === 'PENDING' && (
        <div className="card flex items-start gap-4 p-6" data-animate="fade-up">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
            <Clock size={18} />
          </span>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Under review</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
              Your KYC documents were submitted on{' '}
              {new Date(kyc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' '}and are currently being reviewed by our backend team. This usually takes 2-3 business days.
            </p>
          </div>
        </div>
      )}

      {kyc?.status === 'REJECTED' && (
        <div className="space-y-6">
          <div className="card flex items-start gap-4 p-6" data-animate="fade-up" style={{ background: 'var(--red-50)' }}>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: '#fff' }}>
              <ShieldAlert size={18} style={{ color: 'var(--red-700)' }} />
            </span>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--red-700)' }}>Submission rejected</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--red-700)' }}>
                {kyc.remarks || 'Your KYC submission was rejected. Please review your documents and resubmit.'}
              </p>
            </div>
          </div>
          <KycSubmissionForm resubmit />
        </div>
      )}

      {kyc?.status === 'APPROVED' && (
        <div className="card flex items-start gap-4 p-6" data-animate="fade-up">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--green-700)' }}>Verified</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
              Your identity has been verified. You can now publish listings for sale.
            </p>
            <Link
              href="/dashboard/listings/new"
              className="btn-accent mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Add a Listing
            </Link>
          </div>
        </div>
      )}
    </DashboardEntrance>
  )
}
