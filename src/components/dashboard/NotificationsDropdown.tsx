'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { formatRelativeTime } from '@/lib/format'
import { markNotificationRead, markAllRead } from '@/lib/actions/notifications'

export interface DashboardNotification {
  id: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date
}

export default function NotificationsDropdown({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: DashboardNotification[]
  initialUnreadCount: number
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleItemClick(id: string, isRead: boolean) {
    if (isRead) return
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    startTransition(() => {
      markNotificationRead(id)
    })
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
    startTransition(() => {
      markAllRead()
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04]"
        style={{ color: 'var(--text-2)' }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full"
            style={{ background: 'var(--accent-500)', boxShadow: '0 0 0 2px var(--surface)' }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-80 overflow-hidden rounded-[20px] border"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)', boxShadow: 'var(--elev-3)' }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--accent-700)' }}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n.id, n.isRead)}
                  className="flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-black/[0.02]"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{n.title}</p>
                    {!n.isRead && (
                      <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: 'var(--accent-500)' }} />
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>{n.message}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
