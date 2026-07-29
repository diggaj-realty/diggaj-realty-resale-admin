/**
 * Logs in and screenshots dashboard pages, so UI work can be checked rather than
 * assumed. Not part of the app — a development aid.
 *
 *   npx tsx scripts/shoot.ts <role> <path> [...paths]
 *
 * Role is agent | backend | admin and maps to the shot-* accounts. Images land in
 * .screenshots/, which is gitignored.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:3000'
const PASSWORD = 'shotpass123'

async function main() {
  const [role, ...paths] = process.argv.slice(2)
  if (!role || paths.length === 0) {
    console.error('usage: tsx scripts/shoot.ts <agent|backend|admin> <path> [...paths]')
    process.exit(1)
  }

  mkdirSync('.screenshots', { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(`${BASE}/login`)
  // The form's inputs are unnamed (controlled React state), so target by type.
  await page.fill('input[type="email"]', `shot-${role}@diggajrealty.local`)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {})

  if (!page.url().includes('/dashboard')) {
    console.error(`login failed for ${role} — landed on ${page.url()}`)
    const body = await page.locator('body').innerText().catch(() => '')
    console.error(body.slice(0, 400))
    await browser.close()
    process.exit(1)
  }

  for (const path of paths) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
    const name = `${role}${path.replace(/\//g, '_') || '_root'}.png`
    await page.screenshot({ path: `.screenshots/${name}`, fullPage: true })
    console.log(`.screenshots/${name}`)
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
