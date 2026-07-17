import { statusTone } from '@/lib/data/dashboard'

const TONE_BG: Record<string, string> = {
  green: 'var(--green-50)',
  gold: 'var(--amber-50)',
  purple: 'var(--purple-50)',
  blue: 'var(--blue-50)',
  red: 'var(--red-50)',
}
const TONE_TEXT: Record<string, string> = {
  green: 'var(--green-700)',
  gold: 'var(--amber-700)',
  purple: 'var(--purple-700)',
  blue: 'var(--blue-700)',
  red: 'var(--red-700)',
}

export default function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status)
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: TONE_BG[tone], color: TONE_TEXT[tone] }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
