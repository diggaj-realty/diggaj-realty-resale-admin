/** Indian mobile number handling. Pure/no imports — must stay importable from
 *  client components (signup and profile forms) without dragging in Prisma/pg,
 *  which breaks the browser bundle. Same constraint as statusTone.ts.
 *
 *  Everything is stored in one canonical shape — 10 digits, no country code, no
 *  spaces — so that "9880011223", "+91 98800 11223" and "098800-11223" are the
 *  same buyer rather than three. Agents type numbers off call logs and paper,
 *  and the platform matches leads to people by them, so accepting whatever
 *  arrives and normalising once at the edge is the only thing that holds up.
 */

/** Indian mobile numbers are 10 digits starting 6-9. Short codes and obviously
 *  malformed input are rejected: every use of this field is "call or WhatsApp
 *  this person about their property", which needs a mobile.
 *
 *  Known limitation: an STD-prefixed landline can survive this. "080 2345 6789"
 *  loses its leading 0 like any other prefix and lands on 8023456789 — ten
 *  digits starting 8, indistinguishable from a mobile by shape alone. Detecting
 *  it would need a full STD-code table, and would then reject genuine mobiles
 *  that happen to collide. Treated as a data-entry problem rather than something
 *  a regex can fix: the agent finds out on the first call. */
const MOBILE_RE = /^[6-9]\d{9}$/

/** Strips formatting and the +91/91/0 prefixes people habitually include.
 *  Returns null when nothing usable is left. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null

  let digits = String(input).replace(/\D/g, '')
  if (!digits) return null

  // +91 98800 11223 / 0091... → 9880011223
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2)
  // STD-style leading zero
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  return digits || null
}

export function isValidIndianMobile(input: string | null | undefined): boolean {
  const digits = normalizePhone(input)
  return digits != null && MOBILE_RE.test(digits)
}

/** Normalised number, or null if it isn't a usable Indian mobile. Use this at
 *  every write site so nothing invalid reaches the database. */
export function toStoredPhone(input: string | null | undefined): string | null {
  const digits = normalizePhone(input)
  return digits && MOBILE_RE.test(digits) ? digits : null
}

/** Display form: 98800 11223 — grouped the way Indian numbers are read aloud. */
export function formatPhone(stored: string | null | undefined): string {
  const digits = normalizePhone(stored)
  if (!digits || !MOBILE_RE.test(digits)) return stored ? String(stored) : ''
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

/** `href` for a tap-to-call link, E.164 so it dials from any device. */
export function telHref(stored: string | null | undefined): string | null {
  const digits = toStoredPhone(stored)
  return digits ? `tel:+91${digits}` : null
}

/** `href` for a WhatsApp chat. Built now because it costs nothing and is where
 *  buyer contact actually happens — see the delivery work in CHANGES-PLAN.md. */
export function whatsAppHref(stored: string | null | undefined, message?: string): string | null {
  const digits = toStoredPhone(stored)
  if (!digits) return null
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/91${digits}${text}`
}

export const PHONE_ERROR = 'Enter a valid 10-digit Indian mobile number'
