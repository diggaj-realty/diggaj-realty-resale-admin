'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Bell, Search, ChevronDown, LogOut } from 'lucide-react'
import { ROLE_LABELS, ROLE_TAGLINES } from './navConfig'
import type { UserRole } from '@/types'

const ROLE_AVATAR_BG: Record<UserRole, string> = {
  SELLER: 'linear-gradient(135deg, #7C5CFC, #5533D6)',
  BUYER: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
  AGENT: 'linear-gradient(135deg, #22C55E, #15803D)',
  BACKEND: 'linear-gradient(135deg, #A855F7, #7E22CE)',
  ADMIN: 'linear-gradient(135deg, #F59E0B, #B45309)',
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
}: {
  userName: string
  role: UserRole
  userEmail: string
  unreadCount: number
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const firstName = userName.split(' ')[0]
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <header
      className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-6 px-8"
      style={{
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(14px) saturate(180%)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div>
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-1)' }}>
          Hello, {firstName}
        </h1>
        <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
          {dateLabel} &middot; {ROLE_TAGLINES[role]}
        </p>
      </div>

      <div className="hidden max-w-md flex-1 items-center gap-2 rounded-xl border px-3 py-2 md:flex" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <Search size={16} style={{ color: 'var(--text-3)' }} />
        <input
          placeholder="Search..."
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-1)' }}
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-black/[0.03]"
          style={{ color: 'var(--text-2)' }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full"
              style={{ background: 'var(--red-500)', boxShadow: '0 0 0 2px #fff' }}
            />
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-black/[0.03]"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: ROLE_AVATAR_BG[role] }}
            >
              {initials(userName)}
            </span>
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
              className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl border p-2 shadow-lg"
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
