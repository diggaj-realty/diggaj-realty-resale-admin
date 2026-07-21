import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/api/auth'
import { ok, withApi, readJson, ApiError, parsePagination, paginatedEnvelope } from '@/lib/api/http'
import { propertyDTO } from '@/lib/api/dto'
import { buildRichPropertyData, type RichPropertyInput } from '@/lib/data/propertyFields'
import type { Prisma } from '@prisma/client'

/** Role-scoped listings — mirrors /dashboard/listings.
 *  SELLER: own properties. AGENT: assigned properties. ADMIN/BACKEND: all. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER', 'AGENT', 'ADMIN', 'BACKEND'])

  const url = new URL(req.url)
  const { page, pageSize, skip, take } = parsePagination(url)

  const where: Prisma.PropertyWhereInput =
    user.role === 'SELLER' ? { sellerId: user.id }
    : user.role === 'AGENT' ? { agentId: user.id }
    : {}

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { photos: { orderBy: { order: 'asc' } }, seller: { select: { name: true } } },
      skip,
      take,
    }),
    prisma.property.count({ where }),
  ])

  return ok(paginatedEnvelope(items.map(propertyDTO), total, page, pageSize))
})

/** Create a listing. Expects photo URLs already uploaded via
 *  POST /api/v1/uploads (bucket=property-media). Starts as DRAFT (awaiting backend review). */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['SELLER'])

  const kyc = await prisma.sellerKyc.findUnique({ where: { userId: user.id } })
  if (kyc?.status !== 'APPROVED') throw new ApiError('KYC must be approved before creating a listing', 403)

  const body = await readJson<{
    title?: string
    description?: string
    location?: string
    type?: string
    areaSqft?: number
    bhk?: number | null
    askingPrice?: number
    photoUrls?: string[]
    [key: string]: unknown
  }>(req)

  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const location = String(body.location || '').trim()
  const type = String(body.type || '')
  const areaSqft = Number(body.areaSqft)
  const bhk = type === 'PLOT' || body.bhk == null ? null : Number(body.bhk)
  const askingPrice = Number(body.askingPrice)
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u) => typeof u === 'string' && u) : []

  if (!title) throw new ApiError('title is required', 400)
  if (!location) throw new ApiError('location is required', 400)
  if (!['RESIDENTIAL', 'PLOT', 'COMMERCIAL'].includes(type)) throw new ApiError('Invalid property type', 400)
  if (!areaSqft || areaSqft <= 0) throw new ApiError('areaSqft is required', 400)
  if (!askingPrice || askingPrice <= 0) throw new ApiError('askingPrice is required', 400)

  const rich = buildRichPropertyData(body as unknown as RichPropertyInput)

  const property = await prisma.property.create({
    data: {
      ...rich,
      sellerId: user.id,
      type,
      title,
      description: description || null,
      location,
      areaSqft,
      bhk,
      askingPrice,
      status: 'DRAFT',
    } as Prisma.PropertyUncheckedCreateInput,
  })

  if (photoUrls.length > 0) {
    await prisma.propertyPhoto.createMany({
      data: photoUrls.map((photoUrl, order) => ({ propertyId: property.id, photoUrl, order })),
    })
  }

  const backendUsers = await prisma.user.findMany({ where: { role: 'BACKEND' }, select: { id: true } })
  if (backendUsers.length > 0) {
    await prisma.notification.createMany({
      data: backendUsers.map((u) => ({
        userId: u.id,
        title: 'New listing submitted',
        message: `New listing submitted: ${property.title}.`,
      })),
    })
  }

  const created = await prisma.property.findUnique({
    where: { id: property.id },
    include: { photos: { orderBy: { order: 'asc' } } },
  })

  return ok(propertyDTO(created!), 201)
})
