'use client'

import { createContext, useContext, useState } from 'react'
import Sidebar from './Sidebar'
import type { UserRole } from '@/types'

const SidebarContext = createContext<{ openMobile: () => void } | null>(null)

export function useSidebarMobileToggle() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebarMobileToggle must be used within DashboardChrome')
  return ctx.openMobile
}

export default function DashboardChrome({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <SidebarContext.Provider value={{ openMobile: () => setMobileOpen(true) }}>
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Sidebar
          role={role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div
          className={`transition-[padding] duration-300 ${collapsed ? 'md:pl-[88px]' : 'md:pl-[240px]'}`}
        >
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
