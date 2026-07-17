'use client'

import { useState, useTransition } from 'react'
import { recordTokenPayment, recordFinalPayment, updateDealNotes, closeDeal } from '@/lib/actions/deals'

function toDateInputValue(date: Date | null) {
  if (!date) return ''
  return new Date(date).toISOString().slice(0, 10)
}

export default function DealPaymentForms({
  dealId,
  tokenAmount,
  tokenDate,
  finalAmount,
  finalPaymentDate,
  paymentMode,
  transactionRef,
  notes,
  canClose,
}: {
  dealId: string
  tokenAmount: number | null
  tokenDate: Date | null
  finalAmount: number | null
  finalPaymentDate: Date | null
  paymentMode: string | null
  transactionRef: string | null
  notes: string | null
  canClose: boolean
}) {
  const [tokenPending, startTokenTransition] = useTransition()
  const [finalPending, startFinalTransition] = useTransition()
  const [notesPending, startNotesTransition] = useTransition()
  const [closePending, startCloseTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function runAction(fn: (fd: FormData) => Promise<void>, start: typeof startTokenTransition) {
    return (formData: FormData) => {
      setError(null)
      setNotice(null)
      formData.set('dealId', dealId)
      start(async () => {
        try {
          await fn(formData)
          setNotice('Saved.')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
        }
      })
    }
  }

  function handleClose() {
    setError(null)
    setNotice(null)
    const fd = new FormData()
    fd.set('dealId', dealId)
    startCloseTransition(async () => {
      try {
        await closeDeal(fd)
        setNotice('Deal closed.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not close deal')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6" data-animate="fade-up">
      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>{error}</p>
      )}
      {notice && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>{notice}</p>
      )}

      <form action={runAction(recordTokenPayment, startTokenTransition)} className="card p-6">
        <h3 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Token Payment</h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Amount (₹)</label>
            <input name="tokenAmount" type="number" step="0.01" min="0" defaultValue={tokenAmount ?? ''} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Date</label>
            <input name="tokenDate" type="date" defaultValue={toDateInputValue(tokenDate)} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
          </div>
        </div>
        <button type="submit" disabled={tokenPending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
          {tokenPending ? 'Saving...' : 'Save token payment'}
        </button>
      </form>

      <form action={runAction(recordFinalPayment, startFinalTransition)} className="card p-6">
        <h3 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Final Payment</h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Amount (₹)</label>
            <input name="finalAmount" type="number" step="0.01" min="0" defaultValue={finalAmount ?? ''} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Date</label>
            <input name="finalPaymentDate" type="date" defaultValue={toDateInputValue(finalPaymentDate)} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Mode</label>
            <select name="paymentMode" defaultValue={paymentMode ?? ''} required className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}>
              <option value="" disabled>Select mode</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Transaction Ref</label>
            <input name="transactionRef" type="text" defaultValue={transactionRef ?? ''} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
          </div>
        </div>
        <button type="submit" disabled={finalPending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
          {finalPending ? 'Saving...' : 'Save final payment'}
        </button>
      </form>

      <form action={runAction(updateDealNotes, startNotesTransition)} className="card p-6">
        <h3 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Notes</h3>
        <textarea name="notes" rows={4} defaultValue={notes ?? ''} className="mb-4 w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }} />
        <button type="submit" disabled={notesPending} className="btn-accent rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-70">
          {notesPending ? 'Saving...' : 'Save notes'}
        </button>
      </form>

      <div className="card p-6">
        <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Close Deal</h3>
        <p className="mb-4 text-xs" style={{ color: 'var(--text-3)' }}>
          {canClose ? 'Final payment has been recorded. You can now mark this deal closed.' : 'Record the final payment before you can close this deal.'}
        </p>
        <button
          type="button"
          onClick={handleClose}
          disabled={!canClose || closePending}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          {closePending ? 'Closing...' : 'Mark Closed'}
        </button>
      </div>
    </div>
  )
}
