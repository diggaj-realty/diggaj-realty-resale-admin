'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'

/** Wraps dashboard content and staggers in [data-animate="fade-up"] blocks + count-up
 *  animates any [data-count-to] numbers on mount. Respects prefers-reduced-motion. */
export default function DashboardEntrance({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cards = root.querySelectorAll('[data-animate="fade-up"]')
    const counters = root.querySelectorAll<HTMLElement>('[data-count-to]')

    if (reduceMotion) {
      gsap.set(cards, { opacity: 1, y: 0 })
      return
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.06 }
      )

      counters.forEach((el) => {
        const target = Number(el.dataset.countTo)
        if (!Number.isFinite(target) || target <= 0) return
        const counter = { val: 0 }
        gsap.to(counter, {
          val: target,
          duration: 0.9,
          delay: 0.15,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(counter.val).toString()
          },
        })
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}
