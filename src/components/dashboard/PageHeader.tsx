export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4" data-animate="fade-up">
      <div className="min-w-0">
        <h1 className="h-page truncate" style={{ color: 'var(--text-1)' }}>{title}</h1>
        {subtitle && <p className="mt-1 truncate text-sm" style={{ color: 'var(--text-3)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
