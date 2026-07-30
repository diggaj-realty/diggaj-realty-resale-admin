'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ChevronDown, LogOut, Menu, X, Building2 } from 'lucide-react'
import { getNavGroups, navHome, ROLE_LABELS } from './navConfig'
import { initials } from '@/lib/format'
import SearchOverlay from './SearchOverlay'
import NotificationsDropdown, { type DashboardNotification } from './NotificationsDropdown'
import type { UserRole } from '@/types'

const ROLE_AVATAR_BG: Record<UserRole, string> = {
  SELLER: 'linear-gradient(135deg, #3d4fc4, #283482)',
  BUYER: 'linear-gradient(135deg, #262626, #0a0a0a)',
  AGENT: 'linear-gradient(135deg, #3f9d5c, #2c7345)',
  BACKEND: 'linear-gradient(135deg, #8b7ec8, #5f519e)',
  ADMIN: 'linear-gradient(135deg, #d96c50, #a4432c)',
}

/** Full dashboard chrome — a fixed left sidebar (desktop) / slide-in drawer
 *  (mobile) for navigation, plus a slim sticky top bar (search, notifications,
 *  profile) inside the content column. Every existing nav item/role scoping
 *  from navConfig.ts carries over unchanged — only the layout (top bar ->
 *  sidebar) and color tokens changed, not what any role can reach. */
export default function DashboardShell({
  userName,
  role,
  userEmail,
  unreadCount,
  avatarUrl,
  initialNotifications,
  children,
}: {
  userName: string
  role: UserRole
  userEmail: string
  unreadCount: number
  avatarUrl: string | null
  initialNotifications: DashboardNotification[]
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Grouped, with the utility items still split off to the bottom. Dashboard sits
  // above the groups because it belongs to none of them.
  const groups = getNavGroups(role)
  const primaryGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.secondary) }))
    .filter((group) => group.items.length > 0)
  const secondaryItems = groups.flatMap((group) => group.items.filter((item) => item.secondary))
  const firstName = userName.split(' ')[0]

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
  }

  const navList = (onNavigate?: () => void) => (
    <>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin px-3">
        {(() => {
          const active = isActive(navHome.href)
          const Icon = navHome.icon
          return (
            <Link
              href={navHome.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className="mb-1.5 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? 'var(--accent-50)' : 'transparent',
                color: active ? 'var(--accent-700)' : 'var(--text-2)',
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.25 : 2} />
              <span className="truncate">{navHome.label}</span>
            </Link>
          )
        })()}

        {primaryGroups.map((group) => (
          <div key={group.key} className="mb-1.5 flex flex-col gap-0.5">
            <p
              className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-3)' }}
            >
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: active ? 'var(--accent-50)' : 'transparent',
                    color: active ? 'var(--accent-700)' : 'var(--text-2)',
                  }}
                >
                  <Icon size={17} strokeWidth={active ? 2.25 : 2} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {secondaryItems.length > 0 && (
        <nav className="flex flex-col gap-0.5 border-t px-3 pt-3" style={{ borderColor: 'var(--line)' }}>
          {secondaryItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                }}
              >
                <Icon size={17} />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-black/[0.03]"
            style={{ color: 'var(--red-700)' }}
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </nav>
      )}
    </>
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Desktop sidebar — fixed, always visible */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col py-5 lg:flex"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)' }}
      >
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-4">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-gradient)' }}
          >
            <Building2 size={17} className="text-white" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Diggaj Realty
          </span>
        </Link>
        {navList()}
      </aside>

      {/* Mobile drawer — same nav content, slides in from the left */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col py-5 transition-transform duration-300 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--surface)', boxShadow: 'var(--elev-3)' }}
      >
        <div className="mb-6 flex items-center justify-between px-4">
          <Link href="/dashboard" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <Building2 size={17} className="text-white" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Diggaj Realty
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04]"
            style={{ color: 'var(--text-2)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        {navList(() => setMobileNavOpen(false))}
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header
          className="sticky top-0 z-20 w-full"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-8">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] lg:hidden"
              style={{ color: 'var(--text-2)' }}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="flex-1" />

            <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
              <SearchOverlay />
              <NotificationsDropdown initialNotifications={initialNotifications} initialUnreadCount={unreadCount} />

              <div className="relative" ref={menuRef}>
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
                    className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[20px] border p-2"
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
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  )
}
