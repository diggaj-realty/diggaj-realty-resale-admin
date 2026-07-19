'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react'
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
      className="fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden py-5 transition-[width] duration-200"
      style={{
        width: collapsed ? 84 : 232,
        background: 'linear-gradient(180deg, var(--ink-800), var(--ink-900))',
      }}
    >
      <div className="mb-6 flex items-center justify-between px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))' }}
          >
            <Building2 size={17} />
          </span>
          {!collapsed && <span className="truncate text-sm font-extrabold text-white">Diggaj Realty</span>}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          className="mx-auto mb-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <PanelLeftOpen size={15} />
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {navIcons.map((item) => {
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors"
              style={{
                background: isActive ? 'var(--accent-500)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 px-3 pt-3">
        {!collapsed && (
          <div
            className="relative overflow-hidden rounded-2xl p-4 text-white"
            style={{ background: 'linear-gradient(145deg, var(--accent-500), var(--accent-700))' }}
          >
            <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/10" />
            <span className="relative mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
              <Sparkles size={15} />
            </span>
            <p className="relative text-xs font-bold">{promo.title}</p>
            <p className="relative mt-1 text-[11px] leading-relaxed text-white/80">{promo.body}</p>
            <Link
              href={promo.href}
              className="relative mt-3 block rounded-lg bg-white px-3 py-1.5 text-center text-[11px] font-bold"
              style={{ color: 'var(--accent-700)' }}
            >
              {promo.cta}
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.55)', justifyContent: collapsed ? 'center' : 'flex-start' }}
          title={collapsed ? 'Log out' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  )
}
