import type { LucideIcon } from 'lucide-react'
import {
  Home,
  Building2,
  Briefcase,
  BarChart3,
  Settings,
  Search,
  ShieldCheck,
  ClipboardList,
  Users,
  HandCoins,
  Scale,
  Heart,
  BookmarkPlus,
  CalendarCheck,
  ListChecks,
  Contact,
  MessageSquare,
  LifeBuoy,
  Globe,
} from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavIcon {
  key: string
  label: string
  icon: LucideIcon
  href: string
  /** Utility items (Performance/Feedback/Help) — collapsed into the "More"
   *  dropdown on the desktop nav bar instead of taking a primary slot, since
   *  every role now has enough core work-queue items that all of them in one
   *  row wraps or overflows on real laptop widths (BACKEND/ADMIN were up to
   *  11-12 plain-text links). The mobile drawer still lists every item, flat,
   *  since a vertical scrollable list doesn't have this problem. */
  secondary?: boolean
}

/** Icon-rail nav per role — every icon routes to a real page under /dashboard. */
export function getNavIcons(role: UserRole): NavIcon[] {
  const home: NavIcon = { key: 'home', label: 'Dashboard', icon: Home, href: '/dashboard' }
  const performance: NavIcon = { key: 'performance', label: 'Performance', icon: BarChart3, href: '/dashboard/performance', secondary: true }
  const feedback: NavIcon = { key: 'feedback', label: 'Feedback', icon: MessageSquare, href: '/dashboard/feedback', secondary: true }
  const help: NavIcon = { key: 'help', label: 'Help Center', icon: LifeBuoy, href: '/dashboard/help', secondary: true }
  const settings: NavIcon = { key: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/settings', secondary: true }
  const publicListings: NavIcon = { key: 'public-listings', label: 'Public Listings', icon: Globe, href: '/dashboard/public-listings' }
  const siteVisitsQueue: NavIcon = { key: 'site-visits-queue', label: 'Site Visits', icon: CalendarCheck, href: '/dashboard/site-visits-queue' }

  // SELLER is intentionally absent — SELLER sessions never reach any page
  // this nav renders for (see dashboard/layout.tsx redirect).
  switch (role) {
    case 'BUYER':
      return [
        home,
        { key: 'browse', label: 'Browse Properties', icon: Search, href: '/dashboard/browse' },
        { key: 'shortlist', label: 'Shortlist', icon: Heart, href: '/dashboard/shortlist' },
        { key: 'saved-searches', label: 'Saved Searches', icon: BookmarkPlus, href: '/dashboard/saved-searches' },
        { key: 'site-visits', label: 'Site Visits', icon: CalendarCheck, href: '/dashboard/site-visits' },
        { key: 'offers', label: 'My Offers', icon: HandCoins, href: '/dashboard/offers' },
        { key: 'deals', label: 'My Deals', icon: Briefcase, href: '/dashboard/deals' },
        performance,
        feedback,
        help,
        settings,
      ]
    case 'AGENT':
      return [
        home,
        { key: 'listings', label: 'My Listings', icon: Building2, href: '/dashboard/listings' },
        { key: 'site-visits', label: 'Site Visits', icon: CalendarCheck, href: '/dashboard/site-visits' },
        { key: 'offers', label: 'Offers Received', icon: HandCoins, href: '/dashboard/offers' },
        { key: 'deals', label: 'Assigned Deals', icon: Briefcase, href: '/dashboard/deals' },
        performance,
        feedback,
        help,
        settings,
      ]
    case 'BACKEND':
      return [
        home,
        { key: 'kyc', label: 'KYC Queue', icon: ShieldCheck, href: '/dashboard/kyc' },
        { key: 'queue', label: 'Listings Queue', icon: ClipboardList, href: '/dashboard/queue' },
        { key: 'listings', label: 'All Listings', icon: Building2, href: '/dashboard/listings' },
        publicListings,
        { key: 'negotiations', label: 'Negotiations', icon: Scale, href: '/dashboard/negotiations' },
        siteVisitsQueue,
        { key: 'clients', label: 'Clients', icon: Contact, href: '/dashboard/clients' },
        performance,
        feedback,
        help,
        settings,
      ]
    case 'ADMIN':
      return [
        home,
        { key: 'users', label: 'All Users', icon: Users, href: '/dashboard/users' },
        { key: 'clients', label: 'Clients', icon: Contact, href: '/dashboard/clients' },
        { key: 'listings', label: 'All Listings', icon: Building2, href: '/dashboard/listings' },
        publicListings,
        siteVisitsQueue,
        { key: 'amenities', label: 'Amenities', icon: ListChecks, href: '/dashboard/amenities' },
        performance,
        feedback,
        help,
        settings,
      ]
    default:
      return [home, performance, feedback, help, settings]
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SELLER: 'Seller',
  BUYER: 'Buyer',
  AGENT: 'Agent',
  BACKEND: 'Backend Ops',
  ADMIN: 'Admin',
}
