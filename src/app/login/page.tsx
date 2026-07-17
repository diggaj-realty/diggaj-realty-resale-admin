'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { role: 'Seller', email: 'seller@demo.test' },
  { role: 'Buyer', email: 'buyer@demo.test' },
  { role: 'Agent', email: 'agent@demo.test' },
  { role: 'Backend', email: 'backend@demo.test' },
  { role: 'Admin', email: 'admin@demo.test' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Invalid email or password.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))' }}
          >
            <Building2 size={22} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Resale Dashboard</h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sign in to your portal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@demo.test"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition"
              style={{ borderColor: 'var(--line)', color: 'var(--text-1)' }}
            />
          </div>

          {error && (
            <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-accent flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-70"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--text-3)' }}>
          <p className="mb-2 font-semibold" style={{ color: 'var(--text-2)' }}>Demo accounts (password: password123)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex justify-between">
                <span>{a.role}</span>
                <button
                  type="button"
                  onClick={() => setEmail(a.email)}
                  className="font-mono hover:underline"
                  style={{ color: 'var(--accent-600)' }}
                >
                  {a.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
