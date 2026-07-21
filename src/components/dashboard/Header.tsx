'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Bell, Search, ChevronDown, LogOut, Settings } from 'lucide-react'
import { ROLE_LABELS } from './navConfig'
import type { UserRole } from '@/types'

const ROLE_AVATAR_BG: Record<UserRole, string> = {
  SELLER: 'linear-gradient(135deg, #b98a44, #855d22)',
  BUYER: 'linear-gradient(135deg, #2e2c29, #171717)',
  AGENT: 'linear-gradient(135deg, #3f9d5c, #2c7345)',
  BACKEND: 'linear-gradient(135deg, #8b7ec8, #5f519e)',
  ADMIN: 'linear-gradient(135deg, #d96c50, #a4432c)',
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Header({
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
  const firstName = userName.split(' ')[0]

  return (
    <header
      className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-6 px-8"
      style={{
        background: 'rgba(240,235,225,0.85)',
        backdropFilter: 'blur(14px) saturate(160%)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-full border px-4 py-2.5 shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <Search size={16} style={{ color: 'var(--text-3)' }} />
        <input
          placeholder="Type to search..."
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-1)' }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
          style={{ color: 'var(--text-2)' }}
        >
          <Settings size={18} />
        </Link>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
          style={{ color: 'var(--text-2)' }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full"
              style={{ background: 'var(--red-500)', boxShadow: '0 0 0 2px var(--background)' }}
            />
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-black/[0.05]"
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
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
                {firstName}
              </span>
              <span className="block text-xs leading-tight" style={{ color: 'var(--text-3)' }}>
                {ROLE_LABELS[role]}
              </span>
            </span>
            <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[20px] border p-2 shadow-lg"
              style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
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
    </header>
  )
}
