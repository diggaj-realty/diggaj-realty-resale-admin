import { prisma } from '@/lib/prisma'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { notifyUsers } from '@/lib/notify'
import { recordAudit } from '@/lib/audit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Public, unauthenticated "contact us" form — a visitor who isn't a signed-in
 *  buyer and isn't asking about a specific property yet. Not a PropertyInterest:
 *  that model requires an existing buyer + property, neither of which exists
 *  here. Persisted as an audit entry (immutable, staff-visible) and pushed to
 *  ADMIN/BACKEND as a notification, same as any other new-work signal. */
export const POST = withApi(async (req) => {
  const body = await readJson<{ name?: string; email?: string; phone?: string; message?: string }>(req)

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const phone = String(body.phone || '').trim()
  const message = String(body.message || '').trim()

  if (!name) throw new ApiError('name is required', 400)
  if (!email || !EMAIL_RE.test(email)) throw new ApiError('a valid email is required', 400)
  if (!phone) throw new ApiError('phone is required', 400)
  if (!message) throw new ApiError('message is required', 400)

  await recordAudit({
    action: 'GENERAL_CONTACT_LEAD',
    entity: 'ContactLead',
    meta: { name, email, phone, message },
  })

  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'BACKEND'] } }, select: { id: true } })
  await notifyUsers(
    staff.map((s) => ({
      userId: s.id,
      title: 'New contact form submission',
      message: `${name} (${phone}, ${email}): ${message}`,
    }))
  )

  return ok({ received: true }, 201)
})
