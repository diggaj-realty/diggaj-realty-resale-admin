import { toStoredPhone } from '@/lib/phone'

/** Sending messages to a phone, rather than to a bell icon nobody checks.
 *
 *  Every notification the platform produces is an in-app row. A buyer who saved a
 *  property last Tuesday is not logging in to look at it, which makes the SLA
 *  timers and "we'll be in touch" promises hollow. In Indian resale the
 *  conversation happens on WhatsApp, so that is where these need to land.
 *
 *  Deliberately provider-agnostic. The transport is chosen by WHATSAPP_PROVIDER
 *  and the account details differ per vendor (Meta Cloud API, Gupshup, Twilio),
 *  but the calling code should not care — and until one is configured this is a
 *  no-op that logs, so nothing breaks and nothing is silently dropped either.
 *
 *  Templates matter for the same reason: WhatsApp only permits free-form text
 *  inside a 24-hour customer service window, so anything the platform initiates
 *  has to be a pre-approved template. Sending raw prose would work in testing and
 *  fail in production, so the shape is fixed here from the start.
 */

export type WhatsAppProvider = 'META' | 'GUPSHUP' | 'TWILIO' | 'NONE'

export interface WhatsAppMessage {
  /** Any format — normalised to a bare Indian mobile before sending. */
  to: string
  /** Registered template name. Free-form text is not accepted for
   *  business-initiated messages outside the 24-hour window. */
  template: WhatsAppTemplate
  /** Positional template variables, in the order the template declares them. */
  variables: string[]
  /** Plain-text equivalent, used by the log transport and as the in-app fallback. */
  fallbackText: string
}

/** Templates the platform sends. Names must match what is registered with the
 *  provider; the comment on each is the approved body it stands for. */
export const WHATSAPP_TEMPLATES = {
  /** "Hi {{1}}, an agent will call you shortly about {{2}}." */
  LEAD_RECEIVED: 'lead_received',
  /** "Your visit to {{1}} is booked for {{2}}. Reply if that is not right." */
  VISIT_BOOKED: 'visit_booked',
  /** "{{1}} was recorded as the agreed price for {{2}}. Confirm in the app." */
  PRICE_RECORDED: 'price_recorded',
  /** "Your cost breakdown for {{1}} totals {{2}}." */
  COST_SHEET_SENT: 'cost_sheet_sent',
  /** "A document is needed for {{1}}: {{2}}." */
  DOCUMENT_REQUESTED: 'document_requested',
} as const

export type WhatsAppTemplate = (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES]

export function whatsAppProvider(): WhatsAppProvider {
  const raw = String(process.env.WHATSAPP_PROVIDER ?? '').toUpperCase()
  return raw === 'META' || raw === 'GUPSHUP' || raw === 'TWILIO' ? raw : 'NONE'
}

export interface SendResult {
  ok: boolean
  provider: WhatsAppProvider
  /** Absent when the provider is NONE or the send failed. */
  messageId?: string
  error?: string
  skippedReason?: 'NO_PROVIDER' | 'INVALID_NUMBER'
}

async function sendViaMeta(msg: WhatsAppMessage, to: string): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !token) {
    return { ok: false, provider: 'META', error: 'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set' }
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${to}`,
      type: 'template',
      template: {
        name: msg.template,
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: msg.variables.map((text) => ({ type: 'text', text })) },
        ],
      },
    }),
  })

  if (!res.ok) {
    return { ok: false, provider: 'META', error: `${res.status} ${await res.text()}` }
  }
  const body = (await res.json()) as { messages?: { id: string }[] }
  return { ok: true, provider: 'META', messageId: body.messages?.[0]?.id }
}

/**
 * Sends one message, or explains why it didn't.
 *
 *  Never throws. A notification failing must not roll back the thing it was
 *  notifying about — a lead that was created should stay created even if the
 *  message about it could not be delivered.
 */
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<SendResult> {
  const provider = whatsAppProvider()
  const to = toStoredPhone(msg.to)

  if (!to) return { ok: false, provider, skippedReason: 'INVALID_NUMBER' }

  if (provider === 'NONE') {
    // Logged rather than swallowed: without this, "notifications aren't arriving"
    // is indistinguishable from "no provider is configured".
    console.info(`[whatsapp:disabled] would send "${msg.template}" to ${to}: ${msg.fallbackText}`)
    return { ok: false, provider, skippedReason: 'NO_PROVIDER' }
  }

  try {
    if (provider === 'META') return await sendViaMeta(msg, to)
    // Gupshup and Twilio differ only in transport; add them when one is chosen
    // rather than guessing at request shapes now.
    console.warn(`[whatsapp] provider ${provider} is not implemented yet`)
    return { ok: false, provider, error: `Provider ${provider} not implemented` }
  } catch (err) {
    return { ok: false, provider, error: err instanceof Error ? err.message : 'send failed' }
  }
}

/** Fire-and-forget batch. Failures are logged, never propagated — see sendWhatsApp. */
export async function sendWhatsAppBatch(messages: WhatsAppMessage[]): Promise<void> {
  if (messages.length === 0) return
  const results = await Promise.all(messages.map(sendWhatsApp))
  const failed = results.filter((r) => !r.ok && !r.skippedReason)
  if (failed.length > 0) {
    console.error(`[whatsapp] ${failed.length}/${messages.length} failed: ${failed.map((f) => f.error).join('; ')}`)
  }
}
