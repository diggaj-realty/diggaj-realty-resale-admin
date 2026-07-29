'use client'

import { useState, useTransition } from 'react'
import { declareDealStageAction } from '@/lib/actions/deals'
import { ChevronRight, ChevronLeft, RotateCcw, ShieldCheck, UserRound } from 'lucide-react'

interface StageOption {
  stage: string
  label: string
  direction: 'FORWARD' | 'BACKWARD' | 'CLEAR'
}

export interface StageChangeEntry {
  id: string
  fromStage: string
  toStage: string
  direction: string
  reason: string | null
  actorRole: string
  actorName: string | null
  createdAt: Date
}

/** Drives a deal's progress bar by hand.
 *
 *  Deliberately shows *why* a stage is where it is. "Confirmed by the platform"
 *  and "recorded by staff" are different kinds of claim, and since the buyer and
 *  seller see this bar too, collapsing that distinction is how a progress
 *  indicator turns into a misleading one.
 */
export default function DealStageControl({
  dealId,
  effectiveLabel,
  source,
  derivedLabel,
  options,
  history,
  readOnly,
  needsAmount,
}: {
  dealId: string
  effectiveLabel: string
  source: 'DERIVED' | 'DECLARED'
  derivedLabel: string
  options: StageOption[]
  history: StageChangeEntry[]
  readOnly: boolean
  /** True when no figure is on record yet, so declaring the negotiation stage
   *  has to collect one. */
  needsAmount: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<StageOption | null>(null)

  function submit(formData: FormData) {
    setError(null)
    formData.set('dealId', dealId)
    start(async () => {
      try {
        await declareDealStageAction(formData)
        setChosen(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update the stage')
      }
    })
  }

  const forward = options.filter((o) => o.direction === 'FORWARD')
  const backward = options.filter((o) => o.direction === 'BACKWARD')
  const clear = options.find((o) => o.direction === 'CLEAR')

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Deal stage</h3>
          <p className="mt-1 text-lg font-bold" style={{ color: 'var(--text-1)' }}>{effectiveLabel}</p>
          {source === 'DECLARED' ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--amber-700)' }}>
              <UserRound size={12} /> Recorded by staff — the records show &ldquo;{derivedLabel}&rdquo;
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--green-700)' }}>
              <ShieldCheck size={12} /> Confirmed by the platform from its own records
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      {!readOnly && (
        <>
          {chosen ? (
            <form action={submit} className="mb-4 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <input type="hidden" name="stage" value={chosen.stage} />
              <p className="mb-2 text-xs" style={{ color: 'var(--text-2)' }}>
                {chosen.direction === 'CLEAR'
                  ? `Stop overriding — the stage will follow the records again ("${chosen.label}").`
                  : chosen.direction === 'BACKWARD'
                    ? `Move back to "${chosen.label}". The buyer and seller are told when a stage moves backwards.`
                    : `Move forward to "${chosen.label}".`}
              </p>
              {/* Declaring a negotiation without its figure would be an
                  unauditable claim that a price was settled, so the amount is
                  required — unless one is already on record for this deal. */}
              {chosen.stage === 'NEGOTIATION_RECORDED' && needsAmount && (
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                    Agreed amount (₹)
                  </label>
                  <input
                    name="agreedAmount"
                    type="number"
                    min={1}
                    required
                    placeholder="17000000"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                  />
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    The buyer and seller each confirm this themselves before it becomes the deal&rsquo;s agreed price.
                  </p>
                </div>
              )}
              <input
                name="reason"
                placeholder={chosen.direction === 'BACKWARD' ? 'Why is it moving back? (recommended)' : 'Note (optional)'}
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {pending ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => { setChosen(null); setError(null) }}
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  style={{ color: 'var(--text-3)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : options.length === 0 ? (
            <p className="mb-4 text-xs" style={{ color: 'var(--text-3)' }}>
              The remaining stages are confirmed by the platform — they advance as documents, verification,
              signatures and payment are recorded.
            </p>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              {forward.map((o) => (
                <button
                  key={o.stage}
                  type="button"
                  onClick={() => setChosen(o)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
                >
                  {o.label} <ChevronRight size={13} />
                </button>
              ))}
              {backward.map((o) => (
                <button
                  key={o.stage}
                  type="button"
                  onClick={() => setChosen(o)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                >
                  <ChevronLeft size={13} /> {o.label}
                </button>
              ))}
              {clear && (
                <button
                  type="button"
                  onClick={() => setChosen(clear)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                >
                  <RotateCcw size={12} /> Follow the records
                </button>
              )}
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Stage history
          </p>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="text-xs" style={{ color: 'var(--text-2)' }}>
                <span style={{ color: h.direction === 'BACKWARD' ? 'var(--amber-700)' : 'var(--text-2)' }}>
                  {h.direction === 'BACKWARD' ? '←' : '→'} {h.toStage.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span style={{ color: 'var(--text-3)' }}>
                  {' '}· {h.actorName ?? h.actorRole.toLowerCase()} ·{' '}
                  {new Date(h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
                {h.reason && <span className="block italic" style={{ color: 'var(--text-3)' }}>&ldquo;{h.reason}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
