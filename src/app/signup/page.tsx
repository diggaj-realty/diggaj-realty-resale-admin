'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Building2, Loader2, CheckCircle2 } from 'lucide-react'
import { requestStaffSignup } from '@/lib/actions/staffSignup'

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface-2)' }

export default function SignupPage() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
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
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--cream)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-white"
            style={{ background: 'var(--ink-800)' }}
          >
            <Building2 size={20} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-medium tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>
              Diggaj Realty
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>Request internal dashboard access</p>
          </div>
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
          <form ref={formRef} action={handleSubmit} className="card p-7" style={{ borderRadius: 28 }}>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>Full name</label>
              <input type="text" name="name" required className="w-full rounded-full border px-4 py-2.5 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>Email</label>
              <input type="email" name="email" required className="w-full rounded-full border px-4 py-2.5 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>Phone (optional)</label>
              <input type="tel" name="phone" className="w-full rounded-full border px-4 py-2.5 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
            </div>
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>Password</label>
              <input type="password" name="password" required minLength={8} className="w-full rounded-full border px-4 py-2.5 text-sm outline-none transition-colors focus:border-black/30" style={inputStyle} />
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

            <p className="mt-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              No role selection here — an admin assigns your role after review.
            </p>
            <Link href="/login" className="mt-3 block text-center text-xs font-semibold hover:underline" style={{ color: 'var(--accent-600)' }}>
              Already have access? Sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
