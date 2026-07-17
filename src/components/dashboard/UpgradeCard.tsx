import { Sparkles } from 'lucide-react'
import type { UserRole } from '@/types'

const COPY: Record<UserRole, { title: string; body: string; cta: string }> = {
  SELLER: {
    title: 'Upgrade your listing plan',
    body: 'Go VERIFIED or ELITE to get a "Diggaj Verified" badge and featured placement for your properties.',
    cta: 'View plans',
  },
  BUYER: {
    title: 'Get early access to new listings',
    body: 'Turn on alerts to be notified the moment a matching verified property goes live.',
    cta: 'Enable alerts',
  },
  AGENT: {
    title: 'Unlock agent pro tools',
    body: 'Get deal-close forecasting and priority assignment for high-value listings.',
    cta: 'Explore tools',
  },
  BACKEND: {
    title: 'Speed up your review queue',
    body: 'Bulk-approve verified document sets and get SLA alerts on aging KYC submissions.',
    cta: 'Explore tools',
  },
  ADMIN: {
    title: 'Platform health insights',
    body: 'Get deeper analytics on growth, churn, and agent performance across the platform.',
    cta: 'View insights',
  },
}

export default function UpgradeCard({ role }: { role: UserRole }) {
  const copy = COPY[role]
  return (
    <div
      className="card-hover relative overflow-hidden rounded-2xl p-6 text-white"
      style={{ background: 'linear-gradient(145deg, var(--accent-500), var(--accent-700))', boxShadow: 'var(--elev-accent)' }}
      data-animate="fade-up"
    >
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/10" />
      <div className="relative">
        <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <Sparkles size={17} />
        </span>
        <p className="text-sm font-bold">{copy.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/85">{copy.body}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-bold"
          style={{ color: 'var(--accent-700)' }}
        >
          {copy.cta}
        </button>
      </div>
    </div>
  )
}
