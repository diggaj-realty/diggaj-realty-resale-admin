'use client'

import { useRef, useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { submitFeedback } from '@/lib/actions/feedback'

export default function FeedbackForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await submitFeedback(formData)
          formRef.current?.reset()
          setSent(true)
          setTimeout(() => setSent(false), 3000)
        })
      }}
      className="card p-6"
      data-animate="fade-up"
    >
      <h2 className="h-section" style={{ color: 'var(--text-1)' }}>Share feedback</h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
        Bugs, feature requests, or anything else on your mind — it goes straight to the admin team.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <select
          name="category"
          defaultValue="GENERAL"
          className="rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        >
          <option value="GENERAL">General feedback</option>
          <option value="BUG">Bug report</option>
          <option value="FEATURE_REQUEST">Feature request</option>
        </select>

        <textarea
          name="message"
          required
          rows={4}
          placeholder="Tell us what's on your mind..."
          className="rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />

        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className="btn-brand flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
            <Send size={14} />
            {isPending ? 'Sending...' : 'Send feedback'}
          </button>
          {sent && <span className="text-xs font-medium" style={{ color: 'var(--green-700)' }}>Thanks — feedback sent!</span>}
        </div>
      </div>
    </form>
  )
}
