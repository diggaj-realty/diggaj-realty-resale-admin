import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { authenticate, authenticateOptional } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import { recordPropertyView } from '@/lib/data/propertyViews'
import { buildRichPropertyData, type RichPropertyInput } from '@/lib/data/propertyFields'
import type { Prisma } from '@prisma/client'

const MEDIA_BUCKET = 'property-media'

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** Public — no auth required, so an anonymous visitor can view a listing.
 *  A token is read if present only to skip view-counting the owner's/agent's
 *  own views; anonymous views are always recorded. */
export const GET = withApi(async (req, ctx) => {
  const user = await authenticateOptional(req)
  const { id } = await ctx.params

  const property = await prisma.property.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true, email: true } }, agent: { select: { name: true } } },
  })
  if (!property) throw new ApiError('Property not found', 404)

  // Count genuine buyer interest only — don't inflate on the owner's/agent's own views.
  const isOwnSide = user != null && (user.id === property.sellerId || user.id === property.agentId)
  if (!isOwnSide) await recordPropertyView({ propertyId: id, userId: user?.id ?? null })

  return ok(propertyDTO(property))
})

async function requireOwnedProperty(user: { id: string }, id: string) {
  const property = await prisma.property.findUnique({ where: { id } })
  if (!property) throw new ApiError('Property not found', 404)
  if (property.sellerId !== user.id) throw new ApiError('Forbidden', 403)
  return property
}

/** Seller edits their own listing. Mirrors updateListing in
 *  src/lib/actions/listings.ts — same fields, same "no status restriction"
 *  rule (a LIVE listing can be edited same as a DRAFT one; it doesn't get
 *  pulled back into review just for an edit). photoUrls, if provided, fully
 *  replaces the existing photo set (in the given order) — send the complete
 *  set back, not just new additions; omit the field entirely to leave photos
 *  untouched. */
export const PATCH = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER'])
  const { id } = await ctx.params
  const existing = await requireOwnedProperty(user, id)

  const body = await readJson<{
    title?: string
    description?: string
    location?: string
    type?: string
    areaSqft?: number
    bhk?: number | null
    askingPrice?: number
    unitsAvailable?: number
    photoUrls?: string[]
    [key: string]: unknown
  }>(req)

  const data: Prisma.PropertyUpdateInput = {}
  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) throw new ApiError('title cannot be empty', 400)
    data.title = title
  }
  if (body.description !== undefined) data.description = String(body.description).trim() || null
  if (body.location !== undefined) {
    const location = String(body.location).trim()
    if (!location) throw new ApiError('location cannot be empty', 400)
    data.location = location
  }
  if (body.type !== undefined) {
    if (!['RESIDENTIAL', 'PLOT', 'COMMERCIAL'].includes(String(body.type))) throw new ApiError('Invalid property type', 400)
    data.type = String(body.type)
  }
  if (body.areaSqft !== undefined) {
    const areaSqft = Number(body.areaSqft)
    if (!areaSqft || areaSqft <= 0) throw new ApiError('areaSqft must be a positive number', 400)
    data.areaSqft = areaSqft
  }
  const effectiveType = (data.type as string | undefined) ?? existing.type
  if (body.bhk !== undefined) data.bhk = effectiveType === 'PLOT' ? null : body.bhk == null ? null : Number(body.bhk)
  if (body.askingPrice !== undefined) {
    const askingPrice = Number(body.askingPrice)
    if (!askingPrice || askingPrice <= 0) throw new ApiError('askingPrice must be a positive number', 400)
    data.askingPrice = askingPrice
  }
  if (body.unitsAvailable !== undefined) {
    const unitsAvailable = Number(body.unitsAvailable)
    if (!Number.isInteger(unitsAvailable) || unitsAvailable < 1) throw new ApiError('unitsAvailable must be a positive whole number', 400)
    data.unitsAvailable = unitsAvailable
  }

  Object.assign(data, buildRichPropertyData(body as unknown as RichPropertyInput))

  await prisma.property.update({ where: { id }, data })

  if (Array.isArray(body.photoUrls)) {
    const photoUrls = body.photoUrls.filter((u) => typeof u === 'string' && u)
    await prisma.propertyPhoto.deleteMany({ where: { propertyId: id } })
    if (photoUrls.length > 0) {
      await prisma.propertyPhoto.createMany({
        data: photoUrls.map((photoUrl, order) => ({ propertyId: id, photoUrl, order })),
      })
    }
  }

  const updated = await prisma.property.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  })
  return ok(propertyDTO(updated!))
})

/** Seller deletes their own listing. Mirrors deleteListing in
 *  src/lib/actions/media.ts — blocked once a Deal exists (an accepted offer
 *  means the sale is in motion; deleting the listing under it would orphan
 *  the deal), and cleans up the listing's Supabase Storage photos too. */
export const DELETE = withApi(async (req, ctx) => {
  const user = await authenticate(req, ['SELLER'])
  const { id } = await ctx.params
  await requireOwnedProperty(user, id)

  const deal = await prisma.deal.findUnique({ where: { propertyId: id } })
  if (deal) throw new ApiError('This listing has a deal in progress and cannot be deleted', 409)

  const photos = await prisma.propertyPhoto.findMany({ where: { propertyId: id } })
  const marker = `/object/public/${MEDIA_BUCKET}/`
  const paths = photos
    .map((p) => {
      const idx = p.photoUrl.indexOf(marker)
      return idx === -1 ? null : p.photoUrl.slice(idx + marker.length)
    })
    .filter((p): p is string => p != null)
  if (paths.length > 0) {
    await supabaseAdmin().storage.from(MEDIA_BUCKET).remove(paths)
  }

  await prisma.property.delete({ where: { id } })

  return ok({ id, deleted: true })
})
