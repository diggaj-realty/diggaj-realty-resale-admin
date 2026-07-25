'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Building2, User2, Loader2 } from 'lucide-react'
import StatusPill from './StatusPill'

interface SearchResult {
  id: string
  title: string
  subtitle: string
  status: string
  href: string
}

export default function SearchOverlay() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<SearchResult[]>([])
  const [users, setUsers] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
    else {
      setQuery('')
      setProperties([])
      setUsers([])
    }
  }, [open])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setProperties([])
      setUsers([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timeout = setTimeout(() => {
      fetch(`/api/dashboard/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          setProperties(data.properties ?? [])
          setUsers(data.users ?? [])
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  function goTo(href: string) {
    setOpen(false)
    router.push(href)
  }

  const hasResults = properties.length > 0 || users.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] sm:flex"
        style={{ color: 'var(--text-2)' }}
        aria-label="Search"
      >
        <Search size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24"
          style={{ background: 'rgba(10,10,10,0.4)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[24px]"
            style={{ background: 'var(--surface)', boxShadow: 'var(--elev-3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--line)' }}>
              {loading ? (
                <Loader2 size={16} className="flex-shrink-0 animate-spin" style={{ color: 'var(--text-3)' }} />
              ) : (
                <Search size={16} className="flex-shrink-0" style={{ color: 'var(--text-3)' }} />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search listings, sellers, staff..."
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-1)' }}
              />
              <button type="button" onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {query.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                  Type at least 2 characters to search.
                </p>
              ) : !loading && !hasResults ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No results for &quot;{query}&quot;.</p>
              ) : (
                <>
                  {properties.length > 0 && (
                    <div className="py-2">
                      <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Listings</p>
                      {properties.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => goTo(p.href)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[0.02]"
                        >
                          <Building2 size={15} className="flex-shrink-0" style={{ color: 'var(--accent-700)' }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.title}</span>
                            <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>{p.subtitle}</span>
                          </span>
                          <StatusPill status={p.status} />
                        </button>
                      ))}
                    </div>
                  )}
                  {users.length > 0 && (
                    <div className="border-t py-2" style={{ borderColor: 'var(--line)' }}>
                      <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>People</p>
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => goTo(u.href)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[0.02]"
                        >
                          <User2 size={15} className="flex-shrink-0" style={{ color: 'var(--sky-700)' }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{u.title}</span>
                            <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>{u.subtitle}</span>
                          </span>
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-3)' }}>{u.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
