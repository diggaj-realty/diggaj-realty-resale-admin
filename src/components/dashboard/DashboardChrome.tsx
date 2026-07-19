'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import type { UserRole } from '@/types'

export default function DashboardChrome({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Sidebar role={role} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div
        className="transition-[padding] duration-200"
        style={{ paddingLeft: collapsed ? 84 : 232 }}
      >
        {children}
      </div>
    </div>
  )
}
