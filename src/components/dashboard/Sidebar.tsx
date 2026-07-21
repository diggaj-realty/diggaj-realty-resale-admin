'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, LogOut, PanelLeftClose, PanelLeftOpen, ArrowUpRight } from 'lucide-react'
import { getNavIcons } from './navConfig'
import type { UserRole } from '@/types'

const PROMO_COPY: Record<UserRole, { title: string; body: string; cta: string; href: string }> = {
  SELLER: { title: 'Upgrade your plan', body: 'Go VERIFIED or ELITE for a badge and featured placement.', cta: 'View plans', href: '/dashboard/listings' },
  BUYER: { title: 'Get early access', body: 'Enable alerts to know the moment a matching property goes live.', cta: 'View properties', href: '/dashboard/browse' },
  AGENT: { title: 'Agent pro tools', body: 'Deal-close forecasting and priority assignment for high-value listings.', cta: 'View deals', href: '/dashboard/deals' },
  BACKEND: { title: 'Speed up reviews', body: 'Bulk-approve verified document sets and track SLA on aging KYC.', cta: 'Open queue', href: '/dashboard/queue' },
  ADMIN: { title: 'Platform insights', body: 'Deeper analytics on growth, churn, and agent performance.', cta: 'View performance', href: '/dashboard/performance' },
}

export default function Sidebar({
  role,
  collapsed,
  onToggle,
}: {
  role: UserRole
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()
  const navIcons = getNavIcons(role)
  const promo = PROMO_COPY[role]

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 p-3 transition-[width] duration-300"
      style={{ width: collapsed ? 88 : 240 }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-[28px] py-5"
        style={{ background: 'var(--ink-800)' }}
      >
        <div className="mb-6 flex items-center justify-between px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--cream)', color: 'var(--ink-800)' }}
            >
              <Building2 size={16} />
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight text-white">
                Diggaj Realty
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={onToggle}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="mx-auto mb-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftOpen size={15} />
          </button>
        )}

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3">
          {navIcons.map((item) => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-all duration-300"
                style={{
                  background: isActive ? 'var(--cream)' : 'transparent',
                  color: isActive ? 'var(--ink-800)' : 'rgba(255,255,255,0.55)',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
              >
                <Icon size={17} className="flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-col gap-2 px-3 pt-3">
          {!collapsed && (
            <div
              className="relative overflow-hidden rounded-[20px] p-4"
              style={{ background: 'var(--cream)', color: 'var(--ink-800)' }}
            >
              <p className="text-xs font-semibold">{promo.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {promo.body}
              </p>
              <Link
                href={promo.href}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
                style={{ background: 'var(--ink-800)' }}
              >
                {promo.cta}
                <ArrowUpRight size={12} />
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.55)', justifyContent: collapsed ? 'center' : 'flex-start' }}
            title={collapsed ? 'Log out' : undefined}
          >
            <LogOut size={17} className="flex-shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
