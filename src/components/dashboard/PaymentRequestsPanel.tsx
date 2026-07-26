'use client'

import { useRef, useState, useTransition } from 'react'
import { IndianRupee, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { createPaymentRequest, markPaymentRequestPaid, cancelPaymentRequest } from '@/lib/actions/dealOps'
import { formatINR, formatRelativeTime } from '@/lib/format'

export interface PaymentRequestView {
  id: string
  recipient: string
  amount: number
  title: string | null
  description: string | null
  dueDate: string | null
  status: string
  paidAt: string | null
  paymentRef: string | null
  createdByName: string
  createdAt: string
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; icon: typeof Clock }> = {
  PENDING: { bg: 'var(--amber-50)', fg: 'var(--amber-700)', icon: Clock },
  PAYMENT_INITIATED: { bg: 'var(--blue-50)', fg: 'var(--blue-700)', icon: Clock },
  PAID: { bg: 'var(--green-50)', fg: 'var(--green-700)', icon: CheckCircle2 },
  FAILED: { bg: 'var(--red-50)', fg: 'var(--red-700)', icon: AlertTriangle },
  CANCELLED: { bg: 'var(--surface-2)', fg: 'var(--text-3)', icon: XCircle },
}

/** Payment requests raised against a deal. These ask the buyer or seller for
 *  money and surface on their own dashboard with a Pay Now action — distinct
 *  from Deal.tokenAmount/finalAmount, which record payments already received.
 *  Razorpay is a later phase; until then staff confirm receipt manually. */
export default function PaymentRequestsPanel({
  dealId,
  canManage,
  requests,
}: {
  dealId: string
  canManage: boolean
  requests: PaymentRequestView[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const live = requests.filter((r) => r.status !== 'CANCELLED')
  const outstanding = live.filter((r) => r.status !== 'PAID').reduce((s, r) => s + r.amount, 0)

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, failMessage: string) {
    setError(null)
    fd.set('dealId', dealId)
    startTransition(async () => {
      try {
        await action(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : failMessage)
      }
    })
  }

  return (
    <div className="card p-6" data-animate="fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <IndianRupee size={15} /> Payment Requests
        </h3>
        {live.length > 0 && (
          <span className="text-xs font-semibold" style={{ color: outstanding > 0 ? 'var(--amber-700)' : 'var(--green-700)' }}>
            {outstanding > 0 ? `${formatINR(outstanding)} outstanding` : 'All payments received'}
          </span>
        )}
      </div>

      {canManage && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-accent mb-4 rounded-lg px-4 py-2 text-xs font-semibold"
        >
          Create payment request
        </button>
      )}

      {canManage && open && (
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            formData.set('dealId', dealId)
            startTransition(async () => {
              try {
                await createPaymentRequest(formData)
                formRef.current?.reset()
                setOpen(false)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create payment request')
              }
            })
          }}
          className="mb-5 flex flex-col gap-3 border-b pb-5"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Amount (₹)</label>
              <input
                type="number"
                name="amount"
                required
                min={1}
                placeholder="500000"
                className="w-40 rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Send to</label>
              <select
                name="recipient"
                defaultValue="BUYER"
                className="rounded-lg border px-2.5 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
              >
                <option value="BUYER">Buyer</option>
                <option value="SELLER">Seller</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Due date</label>
              <input
                type="date"
                name="dueDate"
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Title</label>
            <input
              name="title"
              placeholder="e.g. Token payment"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Description</label>
            <textarea
              name="description"
              rows={2}
              placeholder="What this payment covers"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-70">
              {pending ? 'Sending...' : 'Send payment request'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null) }}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-3 text-xs" style={{ color: 'var(--red-700)' }}>{error}</p>}

      {requests.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>No payment requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {requests.map((r) => {
            const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
            const Icon = style.icon
            return (
              <li key={r.id} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                      {r.title || 'Payment'} · {formatINR(r.amount)}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      From: {r.recipient === 'SELLER' ? 'Seller' : 'Buyer'} · raised by {r.createdByName} ·{' '}
                      {formatRelativeTime(new Date(r.createdAt))}
                      {r.dueDate ? ` · due ${new Date(r.dueDate).toLocaleDateString('en-IN')}` : ''}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    <Icon size={11} /> {r.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {r.description && <p className="mt-1.5 text-xs" style={{ color: 'var(--text-2)' }}>{r.description}</p>}
                {r.paymentRef && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Ref: {r.paymentRef}</p>
                )}

                {canManage && r.status !== 'PAID' && r.status !== 'CANCELLED' && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <form
                      action={(fd) => run(markPaymentRequestPaid, fd, 'Failed to mark paid')}
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="paymentRequestId" value={r.id} />
                      <input
                        name="paymentRef"
                        placeholder="Reference (optional)"
                        className="w-44 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                        style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                      />
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
                      >
                        Mark paid
                      </button>
                    </form>
                    <form action={(fd) => run(cancelPaymentRequest, fd, 'Failed to cancel')}>
                      <input type="hidden" name="paymentRequestId" value={r.id} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
