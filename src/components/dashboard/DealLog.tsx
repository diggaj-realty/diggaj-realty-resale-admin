'use client'

import { useRef, useState, useTransition } from 'react'
import { MessageSquareText } from 'lucide-react'
import { addDealLogEntry } from '@/lib/actions/deals'
import { formatRelativeTime } from '@/lib/format'

const ROLE_LABEL: Record<string, string> = {
  AGENT: 'Agent',
  BACKEND: 'Backend Ops',
  ADMIN: 'Admin',
}

export interface DealLogEntryView {
  id: string
  message: string
  authorRole: string
  createdAt: string
}

/** Free-text, dated progress log for a deal — "Sale deed drafting in
 *  progress", "Waiting on seller's NOC". Distinct from the structured
 *  document checklist: this is the running "here's what's happening right
 *  now" update, visible to buyer and seller (read-only) and postable by
 *  the assigned agent or staff. */
export default function DealLog({
  dealId,
  canPost,
  entries,
}: {
  dealId: string
  canPost: boolean
  entries: DealLogEntryView[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <div className="card p-6" data-animate="fade-up">
      <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        <MessageSquareText size={15} /> Progress Log
      </h3>

      {canPost && (
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            formData.set('dealId', dealId)
            startTransition(async () => {
              try {
                await addDealLogEntry(formData)
                formRef.current?.reset()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to post update')
              }
            })
          }}
          className="mb-5 flex flex-col gap-2 border-b pb-5"
          style={{ borderColor: 'var(--line)' }}
        >
          <textarea
            name="message"
            required
            rows={2}
            placeholder="Post an update — e.g. &quot;Sale deed drafting in progress&quot;"
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="btn-accent self-start rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
              {pending ? 'Posting...' : 'Post update'}
            </button>
            {error && <span className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</span>}
          </div>
        </form>
      )}

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>No updates posted yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--accent-700)' }}>{ROLE_LABEL[e.authorRole] ?? e.authorRole}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{formatRelativeTime(new Date(e.createdAt))}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>{e.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
