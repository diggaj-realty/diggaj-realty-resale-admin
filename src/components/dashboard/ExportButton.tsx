'use client'

import { Download } from 'lucide-react'

interface ExportRow {
  title: string
  subtitle: string
  amountLabel: string
  status: string
}

function toCsv(rows: ExportRow[]): string {
  const header = ['Title', 'Detail', 'Amount', 'Status']
  const lines = rows.map((r) => [r.title, r.subtitle, r.amountLabel, r.status].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return [header.join(','), ...lines].join('\n')
}

export default function ExportButton({ rows, filename }: { rows: ExportRow[]; filename: string }) {
  function handleExport() {
    const csv = toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-black/[0.02] disabled:opacity-40"
      style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
    >
      <Download size={15} />
      Export
    </button>
  )
}
