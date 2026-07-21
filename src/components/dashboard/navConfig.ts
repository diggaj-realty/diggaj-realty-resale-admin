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
} from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavIcon {
  key: string
  label: string
  icon: LucideIcon
  href: string
}

/** Icon-rail nav per role — every icon routes to a real page under /dashboard. */
export function getNavIcons(role: UserRole): NavIcon[] {
  const home: NavIcon = { key: 'home', label: 'Dashboard', icon: Home, href: '/dashboard' }
  const performance: NavIcon = { key: 'performance', label: 'Performance', icon: BarChart3, href: '/dashboard/performance' }
  const settings: NavIcon = { key: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/settings' }

  switch (role) {
    case 'SELLER':
      return [
        home,
        { key: 'kyc', label: 'KYC Verification', icon: ShieldCheck, href: '/dashboard/kyc' },
        { key: 'listings', label: 'My Properties', icon: Building2, href: '/dashboard/listings' },
        { key: 'offers', label: 'Offers Received', icon: HandCoins, href: '/dashboard/offers' },
        { key: 'deals', label: 'My Deals', icon: Briefcase, href: '/dashboard/deals' },
        performance,
        settings,
      ]
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
        settings,
      ]
    case 'BACKEND':
      return [
        home,
        { key: 'kyc', label: 'KYC Queue', icon: ShieldCheck, href: '/dashboard/kyc' },
        { key: 'queue', label: 'Listings Queue', icon: ClipboardList, href: '/dashboard/queue' },
        { key: 'negotiations', label: 'Negotiations', icon: Scale, href: '/dashboard/negotiations' },
        performance,
        settings,
      ]
    case 'ADMIN':
      return [
        home,
        { key: 'users', label: 'All Users', icon: Users, href: '/dashboard/users' },
        { key: 'listings', label: 'All Listings', icon: Building2, href: '/dashboard/listings' },
        { key: 'amenities', label: 'Amenities', icon: ListChecks, href: '/dashboard/amenities' },
        performance,
        settings,
      ]
    default:
      return [home, performance, settings]
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SELLER: 'Seller',
  BUYER: 'Buyer',
  AGENT: 'Agent',
  BACKEND: 'Backend Ops',
  ADMIN: 'Admin',
}
