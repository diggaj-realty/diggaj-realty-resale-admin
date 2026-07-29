'use client'

import { useState, useTransition } from 'react'
import { Receipt, Plus, Trash2, Eye, EyeOff, Send, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import { formatINR } from '@/lib/format'
import {
  COST_LINE_CATEGORIES,
  COST_LINE_CATEGORY_LABELS,
  buyerVisibleTotal,
  costSheetTotal,
  isEstimateCategory,
  signedAmount,
  type CostLineCategory,
} from '@/lib/costSheetFields'
import {
  saveCostSheetDraftAction,
  sendCostSheetAction,
  reviseCostSheetAction,
  resolveCostSheetQueryAction,
} from '@/lib/actions/costSheets'

export interface CostSheetLineView {
  id: string
  label: string
  amount: number
  category: string
  note: string | null
  sharedWithBuyer: boolean
}

export interface CostSheetView {
  id: string
  version: number
  status: string
  sentAt: string | null
  acknowledgedAt: string | null
  queriedAt: string | null
  queryNote: string | null
  queriedLineId: string | null
  isQueryOpen: boolean
  lines: CostSheetLineView[]
}

interface DraftRow {
  key: string
  label: string
  amount: string
  category: CostLineCategory
  note: string
  sharedWithBuyer: boolean
}

let rowSeq = 0
function newRow(partial?: Partial<DraftRow>): DraftRow {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    label: '',
    amount: '',
    category: 'CHARGE',
    note: '',
    // Internal by default — brokerage sits on the same sheet as the buyer's
    // charges, and defaulting to shared would leak it the first time someone
    // forgot to untick.
    sharedWithBuyer: false,
    ...partial,
  }
}

/** The full breakdown of what the buyer pays, as line items rather than an
 *  uploaded PDF: the buyer can query one line, the property-price line is checked
 *  against the confirmed agreed price, and the numbers stay reportable.
 *
 *  Authored by the deal's agent or by backend; both see the same sheet. */
export default function CostSheetPanel({
  dealId,
  sheet,
  agreedAmount,
  canAuthor,
}: {
  dealId: string
  sheet: CostSheetView | null
  /** The confirmed agreed price, for the reconciliation hint. Null when no figure
   *  has been agreed by both sides yet. */
  agreedAmount: number | null
  canAuthor: boolean
}) {
  const isDraft = sheet?.status === 'DRAFT'
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function beginEdit() {
    setError(null)
    setRows(
      sheet && sheet.lines.length > 0
        ? sheet.lines.map((l) =>
            newRow({
              label: l.label,
              amount: String(l.amount),
              category: l.category as CostLineCategory,
              note: l.note ?? '',
              sharedWithBuyer: l.sharedWithBuyer,
            })
          )
        : [
            newRow({
              label: 'Agreed property price',
              amount: agreedAmount != null ? String(agreedAmount) : '',
              category: 'PROPERTY_PRICE',
              sharedWithBuyer: true,
            }),
          ]
    )
    setEditing(true)
  }

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, onDone?: () => void) {
    setError(null)
    fd.set('dealId', dealId)
    start(async () => {
      try {
        await action(fd)
        onDone?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const liveLines = rows.map((r) => ({
    category: r.category,
    amount: Number(r.amount) || 0,
    sharedWithBuyer: r.sharedWithBuyer,
  }))

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
          <Receipt size={15} /> Cost breakdown
        </h3>
        {sheet && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={
              sheet.isQueryOpen
                ? { background: 'var(--red-50)', color: 'var(--red-700)' }
                : sheet.acknowledgedAt
                  ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                  : sheet.status === 'SENT'
                    ? { background: 'var(--amber-50)', color: 'var(--amber-700)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-3)' }
            }
          >
            {sheet.isQueryOpen
              ? 'Queried by buyer'
              : sheet.acknowledgedAt
                ? 'Acknowledged'
                : sheet.status === 'SENT'
                  ? 'Awaiting acknowledgement'
                  : `Draft v${sheet.version}`}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      {sheet?.isQueryOpen && (
        <div className="mb-4 rounded-lg p-3" style={{ background: 'var(--red-50)' }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--red-700)' }}>
            <HelpCircle size={12} /> The buyer has a question
            {sheet.queriedLineId && (() => {
              const line = sheet.lines.find((l) => l.id === sheet.queriedLineId)
              return line ? <> about &ldquo;{line.label}&rdquo;</> : null
            })()}
          </p>
          {sheet.queryNote && (
            <p className="mt-1 text-xs italic" style={{ color: 'var(--red-700)' }}>&ldquo;{sheet.queryNote}&rdquo;</p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
            The deal cannot move forward until this is answered.
          </p>
          {canAuthor && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData()
                fd.set('sheetId', sheet.id)
                run(resolveCostSheetQueryAction, fd)
              }}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--surface-1)', color: 'var(--text-2)' }}
            >
              I&rsquo;ve answered this
            </button>
          )}
        </div>
      )}

      {/* ── Read view ── */}
      {!editing && sheet && sheet.lines.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {sheet.lines.map((l) => (
                <tr key={l.id} style={{ opacity: l.sharedWithBuyer ? 1 : 0.55 }}>
                  <td className="py-1.5 pr-3" style={{ color: 'var(--text-1)' }}>
                    {l.label}
                    {isEstimateCategory(l.category) && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: 'var(--amber-700)' }}>
                        estimate
                      </span>
                    )}
                    {!l.sharedWithBuyer && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase" style={{ color: 'var(--text-3)' }}>
                        <EyeOff size={9} /> internal
                      </span>
                    )}
                    {l.note && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{l.note}</p>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-semibold" style={{ color: 'var(--text-1)' }}>
                    {l.category === 'DEDUCTION' ? '−' : ''}{formatINR(l.amount)}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td className="pt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Buyer pays
                </td>
                <td className="whitespace-nowrap pt-2 text-right text-base font-bold" style={{ color: 'var(--accent-700)' }}>
                  {formatINR(buyerVisibleTotal(sheet.lines))}
                </td>
              </tr>
              {costSheetTotal(sheet.lines) !== buyerVisibleTotal(sheet.lines) && (
                <tr>
                  <td className="text-xs" style={{ color: 'var(--text-3)' }}>Including internal lines</td>
                  <td className="whitespace-nowrap text-right text-xs" style={{ color: 'var(--text-3)' }}>
                    {formatINR(costSheetTotal(sheet.lines))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {sheet.acknowledgedAt && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--green-700)' }}>
              <CheckCircle2 size={12} /> The buyer has acknowledged this breakdown
            </p>
          )}
        </div>
      )}

      {!editing && !sheet && (
        <p className="mb-4 text-sm" style={{ color: 'var(--text-3)' }}>
          No cost breakdown has been prepared for this deal yet.
        </p>
      )}

      {/* ── Editor ── */}
      {editing && (
        <form
          action={(fd) => run(saveCostSheetDraftAction, fd, () => setEditing(false))}
          className="mb-4 flex flex-col gap-2"
        >
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="flex flex-wrap items-start gap-2">
                <input
                  name="lineLabel"
                  value={r.label}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
                  placeholder="What is this line?"
                  required
                  className="min-w-[10rem] flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                />
                <input
                  name="lineAmount"
                  value={r.amount}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                  type="number"
                  min={0}
                  placeholder="0"
                  required
                  className="w-32 rounded-lg border px-2.5 py-1.5 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                />
                <select
                  name="lineCategory"
                  value={r.category}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, category: e.target.value as CostLineCategory } : x)))
                  }
                  className="rounded-lg border px-2.5 py-1.5 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
                >
                  {COST_LINE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{COST_LINE_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, sharedWithBuyer: !x.sharedWithBuyer } : x)))}
                  title={r.sharedWithBuyer ? 'Visible to the buyer' : 'Internal only'}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  style={
                    r.sharedWithBuyer
                      ? { background: 'var(--green-50)', color: 'var(--green-700)' }
                      : { background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--line)' }
                  }
                >
                  {r.sharedWithBuyer ? <Eye size={12} /> : <EyeOff size={12} />}
                  {r.sharedWithBuyer ? 'Shown' : 'Internal'}
                </button>
                {r.sharedWithBuyer && <input type="hidden" name="lineShared" value={i} />}
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="rounded-lg px-2 py-1.5"
                  style={{ color: 'var(--red-700)' }}
                  title="Remove this line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                name="lineNote"
                value={r.note}
                onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, note: e.target.value } : x)))}
                placeholder="Note the buyer will see (optional)"
                className="mt-2 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
              />
              {isEstimateCategory(r.category) && (
                <p className="mt-1 text-[11px]" style={{ color: 'var(--amber-700)' }}>
                  Shown to the buyer as an estimate — these move with circle rates and the sub-registrar office.
                </p>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, newRow()])}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
          >
            <Plus size={13} /> Add a line
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              Buyer pays{' '}
              <span className="text-sm font-bold" style={{ color: 'var(--accent-700)' }}>
                {formatINR(buyerVisibleTotal(liveLines))}
              </span>
              {costSheetTotal(liveLines) !== buyerVisibleTotal(liveLines) && (
                <> · {formatINR(costSheetTotal(liveLines))} including internal</>
              )}
              {agreedAmount != null && (
                <>
                  {' '}· agreed price {formatINR(agreedAmount)}
                  {(() => {
                    const priceRows = liveLines.filter((l) => l.category === 'PROPERTY_PRICE')
                    if (priceRows.length !== 1) return null
                    const diff = Math.round(signedAmount(priceRows[0])) - Math.round(agreedAmount)
                    return diff === 0 ? null : (
                      <span className="ml-1 inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--red-700)' }}>
                        <AlertTriangle size={11} /> price line is off by {formatINR(Math.abs(diff))}
                      </span>
                    )
                  })()}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60">
                {pending ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null) }}
                disabled={pending}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
                style={{ color: 'var(--text-3)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Actions ── */}
      {canAuthor && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {(!sheet || isDraft) && (
            <button type="button" onClick={beginEdit} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold">
              {sheet ? 'Edit draft' : 'Prepare cost breakdown'}
            </button>
          )}
          {isDraft && sheet.lines.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData()
                fd.set('sheetId', sheet.id)
                run(sendCostSheetAction, fd)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
            >
              <Send size={12} /> {pending ? 'Sending...' : 'Send to buyer'}
            </button>
          )}
          {sheet?.status === 'SENT' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(reviseCostSheetAction, new FormData())}
              className="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Revise as a new version
            </button>
          )}
        </div>
      )}
    </div>
  )
}
