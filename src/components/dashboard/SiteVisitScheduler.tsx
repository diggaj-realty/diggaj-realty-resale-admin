'use client'

import { useState, useTransition } from 'react'
import { CalendarCheck, CalendarClock, Check, X } from 'lucide-react'
import {
  scheduleSiteVisit,
  proposeSiteVisitDate,
  acceptSiteVisitProposal,
  declineSiteVisitProposal,
} from '@/lib/actions/siteVisits'

/** Agreeing a date for a visit, from the staff side.
 *
 *  Both sides can put a time forward and the other decides, so this shows one of
 *  three things depending on where that exchange stands:
 *
 *  - the buyer proposed → accept it, suggest another time, or decline
 *  - we proposed → read-only, waiting on the buyer (no self-accept: agreeing with
 *    your own proposal would let staff book someone's diary unilaterally)
 *  - nothing on the table → confirm a date, or propose one
 *
 *  Declining cancels the visit outright — that's "not happening", which is a
 *  different thing from "not then", and the latter is what proposing is for. */
export default function SiteVisitScheduler({
  visitId,
  status,
  scheduledDate,
  requestedDate,
  proposedDate,
  proposedBy,
  canAct,
}: {
  visitId: string
  status: string
  scheduledDate: string | null
  requestedDate: string | null
  proposedDate: string | null
  proposedBy: string | null
  canAct: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)

  // Prefill with whatever date is already in play, trimmed to the minutes that
  // datetime-local expects.
  const seed = (proposedDate ?? scheduledDate ?? requestedDate ?? '').slice(0, 16)
  const [dateInput, setDateInput] = useState(seed)

  function run(fn: (fd: FormData) => Promise<void>, fd: FormData, fail: string, after?: () => void) {
    setError(null)
    fd.set('id', visitId)
    startTransition(async () => {
      try {
        await fn(fd)
        after?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : fail)
      }
    })
  }

  if (status === 'COMPLETED' || status === 'CANCELLED') return null
  if (!canAct) return null

  const fmt = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const buyerProposed = proposedBy === 'BUYER' && proposedDate
  const weProposed = proposedBy === 'AGENT' && proposedDate

  const dateField = (
    <input
      type="datetime-local"
      name={proposeOpen ? 'proposedDate' : 'scheduledDate'}
      value={dateInput}
      onChange={(e) => setDateInput(e.target.value)}
      required
      className="rounded-lg border px-2.5 py-1.5 text-xs outline-none"
      style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
    />
  )

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      {buyerProposed && (
        <>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
            Buyer proposed {fmt(proposedDate)} — your call.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(acceptSiteVisitProposal, new FormData(), 'Failed to accept')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              <Check size={13} /> Accept this time
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setProposeOpen((v) => !v); setDeclineOpen(false) }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}
            >
              <CalendarClock size={13} /> Suggest another time
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setDeclineOpen((v) => !v); setProposeOpen(false) }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
            >
              <X size={13} /> Decline
            </button>
          </div>
        </>
      )}

      {weProposed && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          You proposed {fmt(proposedDate)} — waiting on the buyer to accept, decline, or suggest another time.
        </p>
      )}

      {!proposedDate && status === 'REQUESTED' && (
        <div className="flex flex-wrap items-center gap-2">
          <form
            action={(fd) => run(scheduleSiteVisit, fd, 'Failed to schedule')}
            className="flex flex-wrap items-center gap-2"
          >
            {!proposeOpen && dateField}
            {!proposeOpen && (
              <button
                type="submit"
                disabled={pending}
                className="btn-accent flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
              >
                <CalendarCheck size={13} /> Confirm this date
              </button>
            )}
          </form>
          <button
            type="button"
            disabled={pending}
            onClick={() => setProposeOpen((v) => !v)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}
          >
            {proposeOpen ? 'Cancel' : 'Propose a time instead'}
          </button>
        </div>
      )}

      {status === 'SCHEDULED' && !proposedDate && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>
            Confirmed for {scheduledDate ? fmt(scheduledDate) : '—'}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setProposeOpen((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ background: 'var(--blue-50)', color: 'var(--blue-700)' }}
          >
            <CalendarClock size={13} className="mr-1 inline" /> Reschedule
          </button>
        </div>
      )}

      {proposeOpen && (
        <form
          action={(fd) => run(proposeSiteVisitDate, fd, 'Failed to propose', () => setProposeOpen(false))}
          className="flex flex-wrap items-center gap-2"
        >
          {dateField}
          <button
            type="submit"
            disabled={pending}
            className="btn-accent rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
          >
            {pending ? 'Sending...' : 'Propose to buyer'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            The buyer accepts, declines, or suggests another time.
          </span>
        </form>
      )}

      {declineOpen && (
        <form
          action={(fd) => run(declineSiteVisitProposal, fd, 'Failed to decline', () => setDeclineOpen(false))}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="w-56 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-70"
            style={{ background: 'var(--red-500)', color: '#fff' }}
          >
            {pending ? 'Declining...' : 'Decline visit'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            This cancels the visit. To move it instead, suggest another time.
          </span>
        </form>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}
    </div>
  )
}
