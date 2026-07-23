import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { notifyUsers } from '@/lib/notify'
import { buildRichPropertyData, type RichPropertyInput } from '@/lib/data/propertyFields'
import type { Prisma } from '@prisma/client'

/** Creates (or reuses) the placeholder SELLER account behind a no-signup public
 *  submission. The submitter never sets a password — the hash is unusable —
 *  so this account can only be acted on by staff, never logged into directly. */
async function resolveSubmitterUser(name: string, phone: string, email: string | undefined) {
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      if (existing.role !== 'SELLER') {
        throw new ApiError('This email is already registered under a different account type. Use a different email or sign in normally.', 409)
      }
      return existing
    }
  }

  const placeholderEmail = email || `public-${crypto.randomUUID()}@submissions.diggajrealty.local`
  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10)

  return prisma.user.create({
    data: { name, phone, email: placeholderEmail, passwordHash, role: 'SELLER', isActive: true },
  })
}

/** Public, unauthenticated listing intake — the "send this link to a seller"
 *  flow. No account or KYC required up front: a placeholder seller account is
 *  created behind the scenes and the listing starts DRAFT like any other,
 *  landing in the same /queue backend/admin already review from. */
export const POST = withApi(async (req) => {
  const body = await readJson<{
    sellerName?: string
    sellerPhone?: string
    sellerEmail?: string
    title?: string
    description?: string
    location?: string
    type?: string
    areaSqft?: number
    bhk?: number | null
    askingPrice?: number
    photoUrls?: string[]
    videoUrls?: string[]
    [key: string]: unknown
  }>(req)

  const sellerName = String(body.sellerName || '').trim()
  const sellerPhone = String(body.sellerPhone || '').trim()
  const sellerEmail = String(body.sellerEmail || '').trim().toLowerCase() || undefined

  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const location = String(body.location || '').trim()
  const type = String(body.type || '')
  const areaSqft = Number(body.areaSqft)
  const bhk = type === 'PLOT' || body.bhk == null ? null : Number(body.bhk)
  const askingPrice = Number(body.askingPrice)
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u) => typeof u === 'string' && u) : []
  const videoUrls = Array.isArray(body.videoUrls) ? body.videoUrls.filter((u) => typeof u === 'string' && u) : []

  if (!sellerName) throw new ApiError('sellerName is required', 400)
  if (!sellerPhone) throw new ApiError('sellerPhone is required', 400)
  if (!title) throw new ApiError('title is required', 400)
  if (!location) throw new ApiError('location is required', 400)
  if (!['RESIDENTIAL', 'PLOT', 'COMMERCIAL'].includes(type)) throw new ApiError('Invalid property type', 400)
  if (!areaSqft || areaSqft <= 0) throw new ApiError('areaSqft is required', 400)
  if (!askingPrice || askingPrice <= 0) throw new ApiError('askingPrice is required', 400)

  const rich = buildRichPropertyData(body as unknown as RichPropertyInput)
  const submitter = await resolveSubmitterUser(sellerName, sellerPhone, sellerEmail)

  const property = await prisma.property.create({
    data: {
      ...rich,
      sellerId: submitter.id,
      type,
      title,
      description: description || null,
      location,
      areaSqft,
      bhk,
      askingPrice,
      status: 'DRAFT',
      isPublicSubmission: true,
    } as Prisma.PropertyUncheckedCreateInput,
  })

  const media = [
    ...photoUrls.map((photoUrl, order) => ({ propertyId: property.id, photoUrl, mediaType: 'IMAGE', order })),
    ...videoUrls.map((photoUrl, order) => ({ propertyId: property.id, photoUrl, mediaType: 'VIDEO', order: photoUrls.length + order })),
  ]
  if (media.length > 0) {
    await prisma.propertyPhoto.createMany({ data: media })
  }

  const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
  await notifyUsers(
    backendUsers.map((u) => ({
      userId: u.id,
      title: 'New public listing submission',
      message: `${sellerName} submitted "${title}" via the public listing link — no KYC on file, review carefully.`,
    }))
  )

  return ok({ id: property.id, title: property.title }, 201)
})
