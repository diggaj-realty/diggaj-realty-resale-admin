'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Bell, Search, ChevronDown, LogOut, Settings, Menu, X } from 'lucide-react'
import { getNavIcons, ROLE_LABELS } from './navConfig'
import { initials } from '@/lib/format'
import type { UserRole } from '@/types'

const ROLE_AVATAR_BG: Record<UserRole, string> = {
  SELLER: 'linear-gradient(135deg, #ffaa09, #b87700)',
  BUYER: 'linear-gradient(135deg, #262626, #0a0a0a)',
  AGENT: 'linear-gradient(135deg, #3f9d5c, #2c7345)',
  BACKEND: 'linear-gradient(135deg, #8b7ec8, #5f519e)',
  ADMIN: 'linear-gradient(135deg, #d96c50, #a4432c)',
}

export default function TopNav({
  userName,
  role,
  userEmail,
  unreadCount,
  avatarUrl,
}: {
  userName: string
  role: UserRole
  userEmail: string
  unreadCount: number
  avatarUrl: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()
  const navItems = getNavIcons(role)
  const firstName = userName.split(' ')[0]

  return (
    <header
      className="sticky top-0 z-30 w-full"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-3 px-4 sm:px-8">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] lg:hidden"
          style={{ color: 'var(--text-2)' }}
        >
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: 'var(--accent-gradient)', color: 'var(--ink-900)' }}
          >
            D
          </span>
          <span className="hidden truncate text-sm font-semibold tracking-tight sm:inline" style={{ color: 'var(--text-1)' }}>
            Diggaj Realty
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="relative px-3.5 py-2 text-sm font-medium transition-colors"
                style={{ color: isActive ? 'var(--text-1)' : 'var(--text-3)' }}
              >
                {item.label}
                {isActive && (
                  <span
                    className="absolute inset-x-3.5 -bottom-[9px] h-[2px] rounded-full"
                    style={{ background: 'var(--accent-500)' }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] sm:flex"
            style={{ color: 'var(--text-2)' }}
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04]"
            style={{ color: 'var(--text-2)' }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full"
                style={{ background: 'var(--accent-500)', boxShadow: '0 0 0 2px var(--surface)' }}
              />
            )}
          </button>

          <Link
            href="/dashboard/settings"
            className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] sm:flex"
            style={{ color: 'var(--text-2)' }}
          >
            <Settings size={18} />
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-black/[0.04]"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={userName} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: ROLE_AVATAR_BG[role] }}
                >
                  {initials(userName)}
                </span>
              )}
              <span className="hidden text-left md:block">
                <span className="block text-sm font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
                  {firstName}
                </span>
                <span className="block text-xs leading-tight" style={{ color: 'var(--text-3)' }}>
                  {ROLE_LABELS[role]}
                </span>
              </span>
              <ChevronDown size={14} style={{ color: 'var(--text-3)' }} className="hidden md:block" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[20px] border p-2 shadow-lg"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)', boxShadow: 'var(--elev-3)' }}
              >
                <div className="border-b px-2 pb-2" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{userName}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{userEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-black/[0.03]"
                  style={{ color: 'var(--red-700)' }}
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <nav
          className="flex flex-col gap-1 border-t p-3 lg:hidden"
          style={{ borderColor: 'var(--line)' }}
        >
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                style={{ background: isActive ? 'var(--surface-2)' : 'transparent', color: isActive ? 'var(--text-1)' : 'var(--text-3)' }}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
