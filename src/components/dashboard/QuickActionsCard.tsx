import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  PlusCircle,
  Building2,
  HandCoins,
  ShieldCheck,
  Search,
  Heart,
  BookmarkPlus,
  CalendarCheck,
  Scale,
  Briefcase,
  ClipboardList,
  Users,
  ListChecks,
  MessageSquare,
  Globe,
} from 'lucide-react'
import type { UserRole } from '@/types'

interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
  highlight?: boolean
}

// SELLER is intentionally absent — SELLER sessions are redirected away from
// /dashboard entirely (see dashboard/layout.tsx), so this card never renders
// for that role.
function actionsForRole(role: UserRole): QuickAction[] {
  switch (role) {
    case 'BUYER':
      return [
        { label: 'Browse Properties', href: '/dashboard/browse', icon: Search },
        { label: 'Shortlist', href: '/dashboard/shortlist', icon: Heart },
        { label: 'Saved Searches', href: '/dashboard/saved-searches', icon: BookmarkPlus },
        { label: 'Book a Site Visit', href: '/dashboard/site-visits', icon: CalendarCheck },
      ]
    case 'AGENT':
      return [
        { label: 'My Listings', href: '/dashboard/listings', icon: Building2 },
        { label: 'Site Visits', href: '/dashboard/site-visits', icon: CalendarCheck },
        { label: 'Assigned Deals', href: '/dashboard/deals', icon: Briefcase },
        { label: 'Negotiations', href: '/dashboard/negotiations', icon: Scale },
      ]
    case 'BACKEND':
      return [
        { label: 'KYC Queue', href: '/dashboard/kyc', icon: ShieldCheck },
        { label: 'Listings Queue', href: '/dashboard/queue', icon: ClipboardList },
        { label: 'Negotiations', href: '/dashboard/negotiations', icon: Scale },
        { label: 'Public Listings', href: '/dashboard/public-listings', icon: Globe },
      ]
    case 'ADMIN':
      return [
        { label: 'All Users', href: '/dashboard/users', icon: Users },
        { label: 'All Listings', href: '/dashboard/listings', icon: Building2 },
        { label: 'Public Listings', href: '/dashboard/public-listings', icon: Globe },
        { label: 'Amenities', href: '/dashboard/amenities', icon: ListChecks },
        { label: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
      ]
    default:
      return []
  }
}

export default function QuickActionsCard({ role }: { role: UserRole }) {
  const actions = actionsForRole(role)

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="h-section">Quick Actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-black/[0.02]"
            style={{
              borderColor: action.highlight ? 'var(--accent-500)' : 'var(--line)',
              background: action.highlight ? 'var(--accent-50)' : 'transparent',
            }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
            >
              <action.icon size={16} />
            </span>
            <span className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
