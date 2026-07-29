import { prisma } from '@/lib/prisma'
import { sendWhatsAppBatch, type WhatsAppTemplate } from '@/lib/whatsapp'

interface NotifyInput {
  userId: string
  title: string
  message: string
  /** Also send this to the user's phone over WhatsApp.
   *
   *  Opt-in per notification rather than automatic: most of what the platform
   *  writes is internal chatter between staff, and pushing all of it to phones
   *  would train people to ignore the channel. Reserved for the handful of events
   *  a buyer or seller genuinely needs to see when they are not looking at the
   *  app — see WHATSAPP_TEMPLATES. */
  whatsapp?: { template: WhatsAppTemplate; variables: string[] }
}

/** Creates in-app notifications, and sends WhatsApp for those that ask for it.
 *
 *  Delivery is best-effort and deliberately after the database write: a message
 *  that cannot be sent must not cost the in-app record, and neither must roll back
 *  the thing being notified about. sendWhatsApp never throws for the same reason.
 */
export async function notifyUsers(inputs: NotifyInput[]) {
  if (inputs.length === 0) return
  const userIds = Array.from(new Set(inputs.map((n) => n.userId)))
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, phone: true, pushNotifications: true },
  })
  const byId = new Map(users.map((u) => [u.id, u]))

  const allowed = inputs.filter((n) => byId.get(n.userId)?.pushNotifications)
  if (allowed.length > 0) {
    await prisma.notification.createMany({
      data: allowed.map(({ userId, title, message }) => ({ userId, title, message })),
    })
  }

  // WhatsApp honours the same opt-out as in-app, and needs a number on file.
  const outbound = allowed
    .filter((n) => n.whatsapp)
    .map((n) => ({ input: n, user: byId.get(n.userId)! }))
    .filter((x) => x.user.phone)
    .map((x) => ({
      to: x.user.phone!,
      template: x.input.whatsapp!.template,
      variables: x.input.whatsapp!.variables,
      fallbackText: x.input.message,
    }))

  if (outbound.length > 0) await sendWhatsAppBatch(outbound)
}
