'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, User, Mail, Phone, Lock, Eye, EyeOff, UserCheck, Clock, KeyRound } from 'lucide-react'
import { requestStaffSignup } from '@/lib/actions/staffSignup'
import AuthBrandPanel from '@/components/auth/AuthBrandPanel'

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface-2)' }

const FEATURES = [
  { icon: UserCheck, label: 'An admin assigns your exact role after review' },
  { icon: Clock, label: 'Most requests are reviewed within one business day' },
  { icon: KeyRound, label: 'One account, scoped access — nothing more than your role needs' },
]

export default function SignupPage() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await requestStaffSignup(formData)
        formRef.current?.reset()
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <AuthBrandPanel
        headline="Join the team running the resale pipeline."
        subtitle="Request access below — an admin reviews every request and assigns the right role before you can sign in."
        features={FEATURES}
      />

      <div className="flex items-center justify-center px-4 py-12" style={{ background: 'var(--cream)' }}>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--ink-800)' }}>
              <User className="text-white" size={20} />
            </div>
            <h1 className="text-2xl font-medium tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>Diggaj Realty</h1>
          </div>

          {done ? (
            <div className="card p-7 text-center" style={{ borderRadius: 28 }}>
              <CheckCircle2 size={28} className="mx-auto mb-3" style={{ color: 'var(--green-700)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Request submitted</p>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                An admin will review your request and assign your role. You&apos;ll be able to sign in once approved.
              </p>
              <Link href="/login" className="mt-5 inline-block text-xs font-semibold hover:underline" style={{ color: 'var(--accent-600)' }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="card p-7" style={{ borderRadius: 28 }}>
              <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>Request access</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>No role selection — an admin assigns it after review</p>
              </div>

              <form ref={formRef} action={handleSubmit}>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Full name</label>
                  <div className="relative">
                    <User size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                    <input type="text" name="name" required className="w-full rounded-full border py-2.5 pl-11 pr-4 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Email</label>
                  <div className="relative">
                    <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                    <input type="email" name="email" required className="w-full rounded-full border py-2.5 pl-11 pr-4 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Phone (optional)</label>
                  <div className="relative">
                    <Phone size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                    <input type="tel" name="phone" className="w-full rounded-full border py-2.5 pl-11 pr-4 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
                  </div>
                </div>
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Password</label>
                  <div className="relative">
                    <Lock size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      required
                      minLength={8}
                      className="w-full rounded-full border py-2.5 pl-11 pr-11 text-sm outline-none transition-colors focus:border-black/30"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-3)' }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="mb-4 rounded-2xl px-4 py-2.5 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="btn-accent flex w-full items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-70"
                >
                  {pending && <Loader2 size={16} className="animate-spin" />}
                  Request access
                </button>
              </form>
            </div>
          )}

          <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            Already have access?{' '}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent-600)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
