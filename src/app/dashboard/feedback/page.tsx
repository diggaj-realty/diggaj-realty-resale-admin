import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import FeedbackForm from '@/components/dashboard/FeedbackForm'
import { markFeedbackReviewed } from '@/lib/actions/feedback'

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: 'General',
  BUG: 'Bug report',
  FEATURE_REQUEST: 'Feature request',
}

export default async function FeedbackPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { role, id } = session.user

  const isAdmin = role === 'ADMIN'
  const entries = await prisma.feedback.findMany({
    where: isAdmin ? {} : { userId: id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, role: true } } },
    take: 100,
  })

  return (
    <DashboardEntrance>
      <PageHeader title="Feedback" subtitle={isAdmin ? 'All submitted feedback' : 'Your submitted feedback'} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <FeedbackForm />
        </div>

        <div className="card overflow-hidden lg:col-span-2" data-animate="fade-up">
          {entries.length === 0 ? (
            <p className="p-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No feedback yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {entries.map((f) => (
                <li key={f.id} className="flex flex-col gap-1 px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                      >
                        {CATEGORY_LABEL[f.category] ?? f.category}
                      </span>
                      {isAdmin && (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{
                            background: f.status === 'REVIEWED' ? 'rgba(34,197,94,0.14)' : 'rgba(148,163,184,0.18)',
                            color: f.status === 'REVIEWED' ? '#15803d' : '#64748b',
                          }}
                        >
                          {f.status === 'REVIEWED' ? 'Reviewed' : 'Open'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(f.createdAt)}</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-1)' }}>{f.message}</p>
                  {isAdmin && (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{f.user.name} · {f.user.role}</p>
                      {f.status !== 'REVIEWED' && (
                        <form action={markFeedbackReviewed}>
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}>
                            Mark reviewed
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardEntrance>
  )
}
