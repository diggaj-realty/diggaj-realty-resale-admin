import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { LifeBuoy, Mail } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'

const FAQS_BY_ROLE: Record<string, { q: string; a: string }[]> = {
  SELLER: [
    { q: 'How do I list a new property?', a: 'Complete KYC verification first, then use "Add Listing" to submit your property. It starts as a draft until Backend Ops verifies it.' },
    { q: 'Why is my listing still pending?', a: 'All new listings are reviewed by our Backend Ops team before going live. This usually takes 1-2 business days.' },
    { q: 'How do offers reach me?', a: 'Buyer offers are triaged by Backend Ops first — you only see offers that have been forwarded to you for a decision.' },
  ],
  AGENT: [
    { q: 'How do I get assigned to a deal?', a: 'Admin assigns agents to deals once an offer is accepted. Check "Assigned Deals" for your active pipeline.' },
    { q: 'How do site visits work?', a: 'Buyers request visits on listings you’re assigned to; you can schedule, complete, or cancel them from Site Visits.' },
  ],
  BACKEND: [
    { q: 'What am I responsible for?', a: 'Reviewing KYC submissions, verifying new listings in the Queue, and triaging buyer offers under Negotiations.' },
    { q: 'How do I forward an offer to a seller?', a: 'Open the offer under Negotiations and choose "Forward" — the seller can then accept, reject, or counter it.' },
  ],
  ADMIN: [
    { q: 'How do I create staff accounts?', a: 'Use "Create Staff User" on the Users page to provision Agent, Backend Ops, or Admin accounts.' },
    { q: 'Where do I manage platform settings?', a: 'Commission rate, KYC auto-approval, and listing limits are all under Settings > Platform.' },
  ],
}

export default async function HelpPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { role } = session.user

  const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' }, select: { supportEmail: true } })
  const faqs = FAQS_BY_ROLE[role] ?? []

  return (
    <DashboardEntrance>
      <PageHeader title="Help Center" subtitle="Answers to common questions, by role" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2" data-animate="fade-up">
          {faqs.length === 0 ? (
            <p className="p-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>No FAQs for your role yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {faqs.map((f) => (
                <li key={f.q} className="px-6 py-5" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{f.q}</p>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--text-2)' }}>{f.a}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6" data-animate="fade-up">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
          >
            <LifeBuoy size={18} />
          </span>
          <h2 className="mt-3 h-section" style={{ color: 'var(--text-1)' }}>Still stuck?</h2>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-2)' }}>
            Reach out to support directly, or leave a note on the Feedback page.
          </p>
          {config?.supportEmail && (
            <a
              href={`mailto:${config.supportEmail}`}
              className="mt-4 flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--accent-700)' }}
            >
              <Mail size={15} />
              {config.supportEmail}
            </a>
          )}
        </div>
      </div>
    </DashboardEntrance>
  )
}
