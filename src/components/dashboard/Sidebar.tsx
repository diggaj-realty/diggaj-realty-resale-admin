'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, HelpCircle, LogOut } from 'lucide-react'
import { getNavIcons } from './navConfig'
import type { UserRole } from '@/types'

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const navIcons = getNavIcons(role)

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-[76px] flex-col items-center gap-2 py-6"
      style={{ background: 'linear-gradient(180deg, var(--ink-800), var(--ink-900))' }}
    >
      <Link
        href="/dashboard"
        className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-white"
        style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))' }}
      >
        <Building2 size={18} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {navIcons.map((item) => {
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <div key={item.key} className="group relative">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
                style={{
                  background: isActive ? 'rgba(124,92,252,0.18)' : 'transparent',
                  color: isActive ? '#C9BDFC' : 'rgba(255,255,255,0.55)',
                }}
              >
                <Icon size={19} />
              </Link>
              <span
                className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                style={{ background: 'var(--ink-700)' }}
              >
                {item.label}
              </span>
            </div>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-1.5">
        <div className="group relative">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            <HelpCircle size={19} />
          </button>
          <span
            className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: 'var(--ink-700)' }}
          >
            Help & information
          </span>
        </div>
        <div className="group relative">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            <LogOut size={19} />
          </button>
          <span
            className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: 'var(--ink-700)' }}
          >
            Log out
          </span>
        </div>
      </div>
    </aside>
  )
}
