import Link from 'next/link'
import { Calendar, ArrowUpRight } from 'lucide-react'
import ExportButton from './ExportButton'
import type { PipelineItem } from '@/lib/data/dashboard'

export default function DashboardOverviewHeader({
  exportRows,
  exportFilename,
  primaryAction,
}: {
  exportRows: PipelineItem[]
  exportFilename: string
  primaryAction?: { label: string; href: string }
}) {
  const dateLabel = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4" data-animate="fade-up">
      <h1 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--text-1)' }}>Dashboard Overview</h1>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        >
          <Calendar size={15} />
          {dateLabel}
        </span>

        <ExportButton rows={exportRows} filename={exportFilename} />

        {primaryAction && (
          <Link
            href={primaryAction.href}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--ink-900)' }}
          >
            {primaryAction.label}
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </div>
  )
}
