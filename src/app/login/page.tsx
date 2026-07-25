'use client'

import { Suspense, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Building2, Loader2, Mail, Lock, Eye, EyeOff, ShieldCheck, LineChart, ClipboardCheck } from 'lucide-react'
import AuthBrandPanel from '@/components/auth/AuthBrandPanel'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

const FEATURES = [
  { icon: ShieldCheck, label: 'Role-based access for Agents, Ops and Admins' },
  { icon: ClipboardCheck, label: 'Every listing, KYC and offer verified end-to-end' },
  { icon: LineChart, label: 'Real-time performance and pipeline insights' },
]

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  PendingApproval: 'Your signup is awaiting admin approval. Try again once approved.',
  Deactivated: 'This account has been deactivated.',
  StaffOnly: 'This dashboard is for internal staff only. Please use the Diggaj Realty app to sign in.',
  NoEmail: 'Your Google account has no email on file — try a different sign-in method.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const code = searchParams.get('error')
    if (code) setError(GOOGLE_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.')
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError(res.error === 'CredentialsSignin' ? 'Invalid email or password.' : res.error)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <AuthBrandPanel
        headline="The internal engine behind every resale, verified."
        subtitle="Sign in to manage listings, KYC, offers and deals across the whole resale pipeline — built for the team, not the public."
        features={FEATURES}
      />

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-12" style={{ background: 'var(--cream)' }}>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--ink-800)' }}>
              <Building2 size={20} className="text-white" />
            </div>
            <h1 className="text-2xl font-medium tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>Diggaj Realty</h1>
          </div>

          <div className="card p-7" style={{ borderRadius: 28 }}>
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>Welcome back</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>Sign in to your staff portal</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Email</label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@diggajrealty.com"
                    className="w-full rounded-full border py-2.5 pl-11 pr-4 text-sm outline-none transition-colors focus:border-black/30"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface-2)' }}
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Password</label>
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-full border py-2.5 pl-11 pr-11 text-sm outline-none transition-colors focus:border-black/30"
                    style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface-2)' }}
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
                disabled={loading}
                className="btn-accent flex w-full items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-70"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Sign in
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>or</span>
              <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
            </div>

            <GoogleSignInButton />
          </div>

          <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            Need access?{' '}
            <Link href="/signup" className="font-semibold hover:underline" style={{ color: 'var(--accent-600)' }}>
              Request an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
