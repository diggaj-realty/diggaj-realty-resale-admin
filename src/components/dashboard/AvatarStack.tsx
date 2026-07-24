import { initials } from '@/lib/format'

export interface AvatarStackPerson {
  name: string
  avatarUrl?: string | null
}

/** Overlapping circular avatars with a trailing "+N" badge — server-safe, no client JS. */
export default function AvatarStack({ people, max = 4 }: { people: AvatarStackPerson[]; max?: number }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  if (shown.length === 0) return null

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold"
          style={{ background: 'var(--surface-3)', color: 'var(--text-1)', border: '2px solid var(--surface)' }}
          title={p.name}
        >
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            initials(p.name)
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: 'var(--ink-800)', color: '#fff', border: '2px solid var(--surface)' }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
