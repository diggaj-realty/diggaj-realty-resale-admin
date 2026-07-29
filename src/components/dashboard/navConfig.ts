import type { LucideIcon } from 'lucide-react'
import {
  Home,
  Building2,
  Briefcase,
  BarChart3,
  Settings,
  ShieldCheck,
  ClipboardList,
  Users,
  HandCoins,
  Scale,
  CalendarCheck,
  ListChecks,
  Contact,
  MessageSquare,
  LifeBuoy,
  Globe,
  FileCheck2,
  UserRound,
} from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavIcon {
  key: string
  label: string
  icon: LucideIcon
  href: string
  /** Utility items (Performance/Feedback/Help/Settings) — kept out of the primary
   *  nav, since every role has enough real work-queue items without them. */
  secondary?: boolean
}

/** Sections, so the nav can be scanned instead of read.
 *
 *  BACKEND and ADMIN reached 14 flat links, which this file's previous comment
 *  admitted "wraps or overflows on real laptop widths". The fix isn't fewer
 *  destinations — they're all real pages — it's that the list mirrored the data
 *  model rather than the job. Four headings turn fourteen things to read into four
 *  things to scan.
 *
 *  PIPELINE is the funnel in order: a lead becomes a visit, a negotiation, an
 *  accepted offer, a deal. Keeping that sequence visible is the point — those five
 *  pages are stages of one process, and staff previously had to know that to
 *  navigate it. */
export type NavGroupKey = 'PIPELINE' | 'INVENTORY' | 'PEOPLE' | 'SETUP'

export const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  PIPELINE: 'Pipeline',
  INVENTORY: 'Inventory',
  PEOPLE: 'People',
  SETUP: 'Setup',
}

export interface NavGroup {
  key: NavGroupKey
  label: string
  items: NavIcon[]
}

// ── Shared destinations ──
const home: NavIcon = { key: 'home', label: 'Dashboard', icon: Home, href: '/dashboard' }
const performance: NavIcon = { key: 'performance', label: 'Performance', icon: BarChart3, href: '/dashboard/performance', secondary: true }
const feedback: NavIcon = { key: 'feedback', label: 'Feedback', icon: MessageSquare, href: '/dashboard/feedback', secondary: true }
const help: NavIcon = { key: 'help', label: 'Help Center', icon: LifeBuoy, href: '/dashboard/help', secondary: true }
const settings: NavIcon = { key: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/settings', secondary: true }

const leads: NavIcon = { key: 'leads', label: 'Buyer Leads', icon: UserRound, href: '/dashboard/leads' }
const negotiations: NavIcon = { key: 'negotiations', label: 'Negotiations', icon: Scale, href: '/dashboard/negotiations' }
const acceptedOffers: NavIcon = { key: 'accepted-offers', label: 'Accepted Offers', icon: FileCheck2, href: '/dashboard/accepted-offers' }
const deals: NavIcon = { key: 'deals', label: 'Deals', icon: Briefcase, href: '/dashboard/deals' }
const publicListings: NavIcon = { key: 'public-listings', label: 'Public Listings', icon: Globe, href: '/dashboard/public-listings' }
const clients: NavIcon = { key: 'clients', label: 'Clients', icon: Contact, href: '/dashboard/clients' }

/** Amenities is admin setup touched a couple of times a year, so it sits under
 *  Setup rather than taking a primary slot next to the day's work. */
const amenities: NavIcon = { key: 'amenities', label: 'Amenities', icon: ListChecks, href: '/dashboard/amenities', secondary: true }

const UTILITIES = [performance, feedback, help, settings]

/** Grouped nav per role.
 *
 *  SELLER and BUYER are absent: dashboard/layout.tsx redirects both to /login,
 *  since they use the public site and the /api/v1 surface. A BUYER branch lived
 *  here for a long time after that redirect went in, unreachable — removed rather
 *  than left to imply the dashboard supports a role it turns away. */
export function getNavGroups(role: UserRole): NavGroup[] {
  const g = (key: NavGroupKey, items: NavIcon[]): NavGroup => ({ key, label: NAV_GROUP_LABELS[key], items })

  switch (role) {
    case 'AGENT':
      return [
        g('PIPELINE', [
          leads,
          { key: 'site-visits', label: 'Site Visits', icon: CalendarCheck, href: '/dashboard/site-visits' },
          { key: 'negotiations', label: 'My Negotiations', icon: Scale, href: '/dashboard/negotiations' },
          acceptedOffers,
          { key: 'deals', label: 'Assigned Deals', icon: Briefcase, href: '/dashboard/deals' },
        ]),
        g('INVENTORY', [
          { key: 'listings', label: 'My Listings', icon: Building2, href: '/dashboard/listings' },
          { key: 'offers', label: 'Offers Received', icon: HandCoins, href: '/dashboard/offers' },
        ]),
        g('SETUP', UTILITIES),
      ]

    case 'BACKEND':
      return [
        g('PIPELINE', [
          leads,
          { key: 'site-visits-queue', label: 'Site Visits', icon: CalendarCheck, href: '/dashboard/site-visits-queue' },
          negotiations,
          acceptedOffers,
          deals,
        ]),
        g('INVENTORY', [
          { key: 'queue', label: 'Listings Queue', icon: ClipboardList, href: '/dashboard/queue' },
          { key: 'listings', label: 'All Listings', icon: Building2, href: '/dashboard/listings' },
          publicListings,
        ]),
        g('PEOPLE', [
          { key: 'kyc', label: 'KYC Queue', icon: ShieldCheck, href: '/dashboard/kyc' },
          clients,
        ]),
        g('SETUP', UTILITIES),
      ]

    // ADMIN and BACKEND had near-identical 14-item navs, which said neither role
    // knew what it was for. Admin keeps everything — they do stand in on desk work
    // — but leads with the things only they can do: users, roles, configuration.
    case 'ADMIN':
      return [
        g('PEOPLE', [
          { key: 'users', label: 'All Users', icon: Users, href: '/dashboard/users' },
          clients,
        ]),
        g('PIPELINE', [leads, negotiations, acceptedOffers, deals]),
        g('INVENTORY', [
          { key: 'listings', label: 'All Listings', icon: Building2, href: '/dashboard/listings' },
          publicListings,
        ]),
        g('SETUP', [amenities, ...UTILITIES]),
      ]

    default:
      return [g('SETUP', UTILITIES)]
  }
}

/** Flat list, for the mobile drawer and anything that just wants every link.
 *  `home` is prepended because it belongs to no group. */
export function getNavIcons(role: UserRole): NavIcon[] {
  return [home, ...getNavGroups(role).flatMap((group) => group.items)]
}

export { home as navHome }

export const ROLE_LABELS: Record<UserRole, string> = {
  SELLER: 'Seller',
  BUYER: 'Buyer',
  AGENT: 'Agent',
  BACKEND: 'Backend Ops',
  ADMIN: 'Admin',
}
