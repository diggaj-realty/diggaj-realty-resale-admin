'use client'

import { useState, useTransition } from 'react'
import { markDealFellThrough } from '@/lib/actions/deals'
import { DEAL_FAILURE_CODES, DEAL_FAILURE_LABELS } from '@/lib/dealFailureCodes'

/** Records a sale that didn't happen.
 *
 *  Kept behind a confirm step and a required reason: it is a terminal, widely
 *  visible action — the buyer and seller are both notified and the listing goes
 *  back on the market — so it shouldn't be one stray click away. The reason is
 *  mandatory because these codes are the only win/loss data the platform gets.
 */
export default function DealFellThroughForm({ dealId, alreadyFailed }: { dealId: string; alreadyFailed: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (alreadyFailed) return null

  return (
    <div className="card p-6">
      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Deal Fell Through</h3>
      <p className="mb-4 text-xs" style={{ color: 'var(--text-3)' }}>
        Record that this sale is not going ahead — loan rejected, a party withdrew, a title problem. The buyer and
        seller are both notified and the listing goes back on the market so it can be sold to someone else.
      </p>

      {error && (
        <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
        >
          Mark as fallen through
        </button>
      ) : (
        <form
          action={(fd) => {
            setError(null)
            fd.set('dealId', dealId)
            start(async () => {
              try {
                await markDealFellThrough(fd)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not record this')
              }
            })
          }}
        >
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Reason
          </label>
          <select
            name="failureCode"
            required
            defaultValue=""
            className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          >
            <option value="" disabled>
              Select a reason
            </option>
            {DEAL_FAILURE_CODES.map((code) => (
              <option key={code} value={code}>
                {DEAL_FAILURE_LABELS[code]}
              </option>
            ))}
          </select>

          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Note (optional)
          </label>
          <textarea
            name="failureNote"
            rows={3}
            placeholder="What happened, in a line or two"
            className="mb-4 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
          />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
            >
              {pending ? 'Recording...' : 'Confirm — deal fell through'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              disabled={pending}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ color: 'var(--text-3)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
