import type { LucideIcon } from 'lucide-react'
import { Building2 } from 'lucide-react'

export interface AuthFeature {
  icon: LucideIcon
  label: string
}

/** Shared dark brand panel for the staff-only auth pages (login/signup) —
 *  keeps both screens visually consistent without duplicating the gradient/
 *  decorative-blob markup. Hidden below `lg` — mobile just gets the form. */
export default function AuthBrandPanel({
  headline,
  subtitle,
  features,
}: {
  headline: string
  subtitle: string
  features: AuthFeature[]
}) {
  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
      style={{ background: 'linear-gradient(160deg, var(--ink-900) 0%, var(--ink-700) 100%)' }}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full drift"
        style={{ background: 'var(--accent-gradient)', opacity: 0.22, filter: 'blur(10px)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bob"
        style={{ background: 'var(--sky-500)', opacity: 0.12, filter: 'blur(20px)' }}
      />

      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--accent-gradient)' }}>
          <Building2 size={20} style={{ color: 'var(--ink-900)' }} />
        </div>
        <span className="text-lg font-semibold tracking-[-0.02em] text-white">Diggaj Realty</span>
      </div>

      <div className="relative z-10 max-w-md">
        <h1 className="text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-white">{headline}</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/60">{subtitle}</p>

        <div className="mt-9 flex flex-col gap-4">
          {features.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <f.icon size={14} style={{ color: 'var(--accent-500)' }} />
              </span>
              <span className="text-sm text-white/75">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="relative z-10 text-xs text-white/35">Staff-only portal · Diggaj Realty © {new Date().getFullYear()}</p>
    </div>
  )
}
