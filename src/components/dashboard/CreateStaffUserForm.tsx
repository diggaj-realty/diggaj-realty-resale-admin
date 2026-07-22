'use client'

import { useRef, useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import { createStaffUser } from '@/lib/actions/admin'

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }

export default function CreateStaffUserForm() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createStaffUser(formData)
        formRef.current?.reset()
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-accent flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
      >
        <UserPlus size={14} />
        Add Staff Account
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20 bg-black/40 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <form
            ref={formRef}
            action={handleSubmit}
            className="card fixed inset-x-4 top-20 z-30 grid grid-cols-1 gap-3 p-5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:z-20 sm:mt-2 sm:w-[min(90vw,640px)] sm:grid-cols-2"
            data-animate="fade-up"
          >
          <div className="sm:col-span-2">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>New Staff Account</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              Provision an Agent or Backend Ops account. They&apos;ll sign in with the email/password below.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Name</label>
            <input type="text" name="name" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Email</label>
            <input type="email" name="email" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Phone</label>
            <input type="tel" name="phone" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Password</label>
            <input type="password" name="password" required minLength={8} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Role</label>
            <select name="role" required defaultValue="AGENT" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="AGENT">Agent</option>
              <option value="BACKEND">Backend Ops</option>
            </select>
          </div>

          {error && (
            <p className="sm:col-span-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-70">
              {pending ? 'Creating...' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ color: 'var(--text-2)' }}
            >
              Cancel
            </button>
          </div>
          </form>
        </>
      )}
    </div>
  )
}
