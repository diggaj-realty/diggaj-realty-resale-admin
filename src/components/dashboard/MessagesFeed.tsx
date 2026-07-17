'use client'

import { useTransition } from 'react'
import { Bell } from 'lucide-react'
import { formatRelativeTime } from '@/lib/format'
import { markNotificationRead, markAllRead } from '@/lib/actions/notifications'

interface NotificationRow {
  id: string
  title: string
  message: string
  createdAt: Date
  isRead: boolean
}

function initials(text: string) {
  return text.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

const AVATAR_COLORS = ['#7C5CFC', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444']

export default function MessagesFeed({ notifications }: { notifications: NotificationRow[] }) {
  const [pending, startTransition] = useTransition()
  const hasUnread = notifications.some((n) => !n.isRead)

  return (
    <div className="card card-hover p-6" data-animate="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Activity</h2>
        {hasUnread && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => markAllRead())}
            className="text-xs font-semibold disabled:opacity-60"
            style={{ color: 'var(--accent-600)' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Bell size={22} style={{ color: 'var(--text-3)' }} />
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>No activity yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {notifications.map((n, i) => (
            <li key={n.id}>
              <button
                type="button"
                disabled={pending || n.isRead}
                onClick={() => startTransition(() => markNotificationRead(n.id))}
                className="flex w-full gap-3 text-left disabled:cursor-default"
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {initials(n.title)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-1)' }}>{n.title}</p>
                  <p className="mt-0.5 truncate text-xs leading-snug" style={{ color: 'var(--text-3)' }}>{n.message}</p>
                  <p className="mt-1 text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <span className="ml-auto mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: 'var(--accent-500)' }} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
