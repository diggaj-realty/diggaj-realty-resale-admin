export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4" data-animate="fade-up">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
