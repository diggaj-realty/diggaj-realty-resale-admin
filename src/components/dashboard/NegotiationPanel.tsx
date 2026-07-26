'use client'

import { useRef, useState, useTransition } from 'react'
import { Scale, Phone, Users, Check, X, Clock, ArrowRight } from 'lucide-react'
import {
  startNegotiation,
  addNegotiationEvent,
  endNegotiation,
  createDealFromNegotiation,
} from '@/lib/actions/negotiations'
import { formatINR, formatRelativeTime } from '@/lib/format'

export interface NegotiationEventView {
  id: string
  actorRole: string
  eventType: string
  amount: number | null
  note: string | null
  createdAt: string
}

export interface NegotiationView {
  id: string
  channel: string
  status: string
  proposedAmount: number | null
  finalAgreedAmount: number | null
  buyerConfirmed: boolean
  sellerConfirmed: boolean
  dealId: string | null
  events: NegotiationEventView[]
}

const EVENT_LABELS: Record<string, string> = {
  BUYER_POSITION: 'Buyer position',
  SELLER_POSITION: 'Seller position',
  AGENT_NOTE: 'Agent note',
  BUYER_COUNTER: 'Buyer counter',
  SELLER_COUNTER: 'Seller counter',
  PRICE_PROPOSED: 'Price proposed',
  BUYER_CONFIRMED: 'Buyer confirmed',
  SELLER_CONFIRMED: 'Seller confirmed',
  AGREEMENT_REACHED: 'Agreement reached',
  NEGOTIATION_FAILED: 'Negotiation closed',
  CONFIRMATIONS_RESET: 'Confirmations reset',
}

/** Agent-assisted negotiation: the agent records what each side said on the
 *  phone or in person, then puts a figure to both parties.
 *
 *  There is deliberately no confirm button here. Confirmation is each party's own
 *  act, done from their own app with their own login — an agent writing down
 *  "they agreed" is a record of a conversation, not consent, and cannot create a
 *  deal on its own. This panel shows their confirmations arriving and only
 *  unlocks deal creation once both are genuinely in. */
export default function NegotiationPanel({
  interestId,
  negotiation,
  canManage,
  buyerName,
  sellerName,
  askingPrice,
}: {
  interestId: string
  negotiation: NegotiationView | null
  canManage: boolean
  buyerName: string
  sellerName: string
  askingPrice: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [eventOpen, setEventOpen] = useState(false)
  const startRef = useRef<HTMLFormElement>(null)
  const eventRef = useRef<HTMLFormElement>(null)

  function run(fn: (fd: FormData) => Promise<void>, fd: FormData, failMessage: string, after?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        await fn(fd)
        after?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : failMessage)
      }
    })
  }

  const isActive =
    negotiation != null &&
    (negotiation.status === 'OPEN' || negotiation.status === 'AGREEMENT_PENDING_CONFIRMATION')
  const bothConfirmed = negotiation?.buyerConfirmed && negotiation?.sellerConfirmed
  const readyForDeal = bothConfirmed && negotiation?.proposedAmount != null && !negotiation?.dealId

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <Scale size={15} /> Agent-assisted Negotiation
        </h3>
        {negotiation && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
            style={
              negotiation.status === 'AGREED'
                ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                : isActive
                  ? { background: 'var(--blue-50)', color: 'var(--blue-700)' }
                  : { background: 'var(--surface-2)', color: 'var(--text-3)' }
            }
          >
            {negotiation.channel.replace('_', '-').toLowerCase()} · {negotiation.status.replace(/_/g, ' ').toLowerCase()}
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}

      {/* ── No negotiation yet ── */}
      {!negotiation && (
        <>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-3)' }}>
            No negotiation has been started. Open one once you&apos;ve spoken to the buyer — recording positions here
            keeps the history, and both parties confirm the final figure themselves.
          </p>
          {canManage && (
            <form
              ref={startRef}
              action={(fd) => {
                fd.set('interestId', interestId)
                run(startNegotiation, fd, 'Failed to start negotiation', () => startRef.current?.reset())
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Channel</label>
                <select
                  name="channel"
                  defaultValue="PHONE"
                  className="rounded-lg border px-2.5 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
                >
                  <option value="PHONE">Phone</option>
                  <option value="IN_PERSON">In person</option>
                  <option value="ONLINE">Online</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
                <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Opening note</label>
                <input
                  name="note"
                  placeholder="e.g. Spoke to buyer, keen but wants a discount"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                />
              </div>
              <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
                {pending ? 'Starting...' : 'Start negotiation'}
              </button>
            </form>
          )}
        </>
      )}

      {negotiation && (
        <>
          {/* ── Where the money stands ── */}
          <div className="mb-4 flex flex-wrap items-center gap-6 rounded-lg p-4" style={{ background: 'var(--surface-2)' }}>
            <Figure label="Asking" value={formatINR(askingPrice)} />
            {negotiation.proposedAmount != null && (
              <Figure label="On the table" value={formatINR(negotiation.proposedAmount)} accent />
            )}
            {negotiation.finalAgreedAmount != null && (
              <Figure label="Agreed" value={formatINR(negotiation.finalAgreedAmount)} accent />
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Confirmations
              </span>
              <div className="flex gap-1.5">
                <ConfirmChip name={buyerName} confirmed={negotiation.buyerConfirmed} />
                <ConfirmChip name={sellerName} confirmed={negotiation.sellerConfirmed} />
              </div>
            </div>
          </div>

          {negotiation.proposedAmount != null && !bothConfirmed && isActive && (
            <p className="mb-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
              Waiting on {!negotiation.buyerConfirmed ? buyerName : ''}
              {!negotiation.buyerConfirmed && !negotiation.sellerConfirmed ? ' and ' : ''}
              {!negotiation.sellerConfirmed ? sellerName : ''} to confirm this figure in their own app. You can&apos;t
              confirm on their behalf.
            </p>
          )}

          {/* ── Record a step ── */}
          {canManage && isActive && (
            <div className="mb-4">
              {!eventOpen ? (
                <button
                  type="button"
                  onClick={() => setEventOpen(true)}
                  className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold"
                >
                  Record a step
                </button>
              ) : (
                <form
                  ref={eventRef}
                  action={(fd) => {
                    fd.set('sessionId', negotiation.id)
                    run(addNegotiationEvent, fd, 'Failed to record step', () => {
                      eventRef.current?.reset()
                      setEventOpen(false)
                    })
                  }}
                  className="flex flex-col gap-3 border-t pt-4"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>What happened</label>
                      <select
                        name="eventType"
                        defaultValue="BUYER_POSITION"
                        className="rounded-lg border px-2.5 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
                      >
                        <option value="BUYER_POSITION">Buyer position</option>
                        <option value="SELLER_POSITION">Seller position</option>
                        <option value="BUYER_COUNTER">Buyer counter</option>
                        <option value="SELLER_COUNTER">Seller counter</option>
                        <option value="AGENT_NOTE">Note (no amount)</option>
                        <option value="PRICE_PROPOSED">Propose price to both parties</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Amount (₹)</label>
                      <input
                        type="number"
                        name="amount"
                        min={1}
                        placeholder="3800000"
                        className="w-40 rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                      />
                    </div>
                  </div>
                  <input
                    name="note"
                    placeholder="Note (optional)"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    &ldquo;Propose price&rdquo; puts a figure to both parties to confirm. Changing it later clears any
                    confirmations already given.
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
                      {pending ? 'Saving...' : 'Record'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEventOpen(false); setError(null) }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── Create the deal ── */}
          {canManage && readyForDeal && (
            <form
              action={(fd) => {
                fd.set('sessionId', negotiation.id)
                run(createDealFromNegotiation, fd, 'Failed to create deal')
              }}
              className="mb-4 rounded-lg p-4"
              style={{ background: 'var(--green-50)' }}
            >
              <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--green-700)' }}>
                Both parties have confirmed {formatINR(negotiation.proposedAmount!)} — ready to open the deal.
              </p>
              <button type="submit" disabled={pending} className="btn-accent inline-flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
                {pending ? 'Creating...' : 'Create deal'} <ArrowRight size={13} />
              </button>
            </form>
          )}

          {negotiation.dealId && (
            <p className="mb-4 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
              This negotiation produced a deal. Continue in Accepted Offers.
            </p>
          )}

          {/* ── History ── */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              History
            </p>
            {negotiation.events.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nothing recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-2 border-l pl-4" style={{ borderColor: 'var(--line)' }}>
                {negotiation.events.map((e) => (
                  <li key={e.id} className="relative text-xs">
                    <span
                      className="absolute -left-[21px] top-1 h-2 w-2 rounded-full"
                      style={{
                        background:
                          e.eventType === 'CONFIRMATIONS_RESET' ? 'var(--amber-700)'
                          : e.eventType.endsWith('CONFIRMED') || e.eventType === 'AGREEMENT_REACHED' ? 'var(--green-700)'
                          : 'var(--accent-700)',
                      }}
                    />
                    <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                      {EVENT_LABELS[e.eventType] ?? e.eventType}
                    </span>
                    {e.amount != null && (
                      <span style={{ color: 'var(--accent-700)' }}> · {formatINR(e.amount)}</span>
                    )}
                    <span style={{ color: 'var(--text-3)' }}>
                      {' '}· {e.actorRole.toLowerCase()} · {formatRelativeTime(new Date(e.createdAt))}
                    </span>
                    {e.note && <p style={{ color: 'var(--text-2)' }}>{e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── Walk away ── */}
          {canManage && isActive && (
            <form
              action={(fd) => {
                fd.set('sessionId', negotiation.id)
                fd.set('outcome', 'FAILED')
                run(endNegotiation, fd, 'Failed to close negotiation')
              }}
              className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"
              style={{ borderColor: 'var(--line)' }}
            >
              <input
                name="note"
                placeholder="Why is this not going ahead?"
                className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)', minWidth: 200 }}
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
              >
                Close negotiation
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className="text-base font-bold" style={{ color: accent ? 'var(--accent-700)' : 'var(--text-1)' }}>{value}</p>
    </div>
  )
}

function ConfirmChip({ name, confirmed }: { name: string; confirmed: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
      style={
        confirmed
          ? { background: 'var(--green-50)', color: 'var(--green-700)' }
          : { background: 'var(--surface)', color: 'var(--text-3)' }
      }
    >
      {confirmed ? <Check size={11} /> : <Clock size={11} />} {name}
    </span>
  )
}
