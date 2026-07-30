/**
 * Checks the dashboard nav against the pages that actually exist.
 *
 *  Written because dead code survived a long time unnoticed: a BUYER nav branch
 *  outlived the layout redirect that made it unreachable, pointing at three pages
 *  which each began by redirecting BUYER away. Nobody could open them, nothing
 *  complained, and they were only found by walking the routes by hand.
 *
 *  Two failures, both silent without this:
 *
 *   - A nav link to a page that no longer exists — a 404 for whoever clicks it.
 *   - A page no role can reach from the nav — either dead code, or a feature that
 *     shipped without a way in.
 *
 *  Run with `npm run check:routes`. Exits non-zero so it can gate a build.
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getNavGroups, getNavIcons } from '../src/components/dashboard/navConfig'
import type { UserRole } from '../src/types'

/** Roles that can actually reach the dashboard. SELLER and BUYER are redirected to
 *  /login by dashboard/layout.tsx, so they have no nav to check. */
const DASHBOARD_ROLES: UserRole[] = ['AGENT', 'BACKEND', 'ADMIN']

/**
 * Pages deliberately absent from the nav, each with the reason.
 *
 *  Keeping the justification here is the point: an entry someone cannot explain is
 *  an entry that should be a nav item or a deleted page.
 */
const NOT_IN_NAV: Record<string, string> = {
  '/dashboard/listings/new': 'Reached by the "Add Listing" button on the listings page, where the context is.',
}

function dashboardPages(dir: string, base = '/dashboard'): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    // Dynamic segments are detail pages reached from a list, never nav targets.
    if (entry.startsWith('[')) continue
    const href = `${base}/${entry}`
    if (existsSync(join(full, 'page.tsx'))) out.push(href)
    out.push(...dashboardPages(full, href))
  }
  return out
}

function main() {
  const pages = dashboardPages('src/app/dashboard').sort()
  const problems: string[] = []

  for (const role of DASHBOARD_ROLES) {
    const items = getNavIcons(role)
    const groups = getNavGroups(role)
    const primary = groups.reduce((n, g) => n + g.items.filter((i) => !i.secondary).length, 0)
    console.log(`${role.padEnd(8)} ${items.length} links · ${groups.length} groups · ${primary} primary`)

    for (const item of items) {
      // /dashboard itself is a page.tsx at the root of the tree, not a subdirectory.
      if (item.href === '/dashboard') continue
      if (!pages.includes(item.href)) {
        problems.push(`${role} nav links to ${item.href}, which has no page.tsx`)
      }
    }

    const dupes = items.map((i) => i.href).filter((h, idx, arr) => arr.indexOf(h) !== idx)
    if (dupes.length > 0) problems.push(`${role} nav lists ${[...new Set(dupes)].join(', ')} more than once`)
  }

  const reachable = new Set(DASHBOARD_ROLES.flatMap((r) => getNavIcons(r).map((i) => i.href)))
  for (const page of pages) {
    if (reachable.has(page) || page in NOT_IN_NAV) continue
    problems.push(`${page} exists but no role can reach it from the nav (add it, delete it, or justify it in NOT_IN_NAV)`)
  }

  // A stale exemption is its own kind of rot.
  for (const href of Object.keys(NOT_IN_NAV)) {
    if (!pages.includes(href)) problems.push(`NOT_IN_NAV lists ${href}, which no longer exists — remove the entry`)
    else if (reachable.has(href)) problems.push(`NOT_IN_NAV lists ${href}, but it is in the nav now — remove the entry`)
  }

  console.log(`\n${pages.length} dashboard pages, ${reachable.size} reachable from a nav, ${Object.keys(NOT_IN_NAV).length} exempt`)

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('routes ok')
}

main()
