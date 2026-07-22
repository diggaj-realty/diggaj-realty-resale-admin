import type { User, Property, PropertyPhoto, Offer, Deal, SellerKyc, Notification } from '@prisma/client'
import { buyerFacingOfferStatus } from '@/lib/data/dashboard'

export function userDTO(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }
}

export function kycDTO(k: SellerKyc) {
  return {
    id: k.id,
    userId: k.userId,
    idType: k.idType,
    idDocUrl: k.idDocUrl,
    selfieUrl: k.selfieUrl,
    status: k.status,
    remarks: k.remarks,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  }
}

export function photoDTO(p: PropertyPhoto) {
  return { id: p.id, url: p.photoUrl, mediaType: p.mediaType, order: p.order }
}

type PropertyWithRelations = Property & {
  photos?: PropertyPhoto[]
  videos?: PropertyPhoto[]
  seller?: { name: string; email?: string } | null
  agent?: { name: string } | null
}

export function propertyDTO(p: PropertyWithRelations) {
  return {
    id: p.id,
    sellerId: p.sellerId,
    agentId: p.agentId,
    type: p.type,
    title: p.title,
    description: p.description,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    areaSqft: p.areaSqft,
    bhk: p.bhk,
    askingPrice: p.askingPrice,
    unitsAvailable: p.unitsAvailable,
    status: p.status,
    plan: p.plan,
    viewCount: p.viewCount,
    // ── Structured location ──
    city: p.city,
    locality: p.locality,
    pincode: p.pincode,
    // ── Area breakdown ──
    carpetAreaSqft: p.carpetAreaSqft,
    builtUpAreaSqft: p.builtUpAreaSqft,
    superBuiltUpAreaSqft: p.superBuiltUpAreaSqft,
    // ── Configuration ──
    bathrooms: p.bathrooms,
    balconies: p.balconies,
    furnishing: p.furnishing,
    facing: p.facing,
    floorNumber: p.floorNumber,
    totalFloors: p.totalFloors,
    ageYears: p.ageYears,
    parkingCovered: p.parkingCovered,
    parkingOpen: p.parkingOpen,
    // ── Legal / commercial ──
    possessionStatus: p.possessionStatus,
    possessionDate: p.possessionDate ? p.possessionDate.toISOString() : null,
    ownershipType: p.ownershipType,
    reraId: p.reraId,
    priceNegotiable: p.priceNegotiable,
    maintenanceMonthly: p.maintenanceMonthly,
    // ── Media & amenities ──
    floorPlanUrl: p.floorPlanUrl,
    // Legacy single-video field; kept populated (falling back to the first
    // uploaded video) for older clients, but new integrations should use
    // `videos` / `photos[].mediaType === "VIDEO"` below instead.
    videoUrl: p.photos?.find((ph) => ph.mediaType === 'VIDEO')?.photoUrl ?? p.videoUrl,
    amenities: p.amenities,

    // ── Builder / project ──
    builderName: p.builderName,
    projectName: p.projectName,
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    sellerName: p.seller?.name,
    sellerEmail: p.seller?.email,
    agentName: p.agent?.name,
    // All media (images + videos); check `mediaType` to tell them apart.
    photos: p.photos ? p.photos.map(photoDTO) : undefined,
    // Convenience subset: videos only, same shape as `photos`.
    videos: p.photos ? p.photos.filter((ph) => ph.mediaType === 'VIDEO').map(photoDTO) : undefined,
  }
}

type OfferWithRelations = Offer & {
  property?: { title: string; location: string } | null
  buyer?: { name: string } | null
}

export function offerDTO(o: OfferWithRelations, opts?: { forBuyer?: boolean }) {
  return {
    id: o.id,
    propertyId: o.propertyId,
    buyerId: o.buyerId,
    amount: o.amount,
    message: o.message,
    status: o.status,
    displayStatus: opts?.forBuyer ? buyerFacingOfferStatus(o.status) : o.status,
    counterAmount: o.counterAmount,
    counterBy: o.counterBy,
    reviewedBy: o.reviewedBy,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    propertyTitle: o.property?.title,
    propertyLocation: o.property?.location,
    buyerName: o.buyer?.name,
  }
}

type DealWithRelations = Deal & {
  property?: { title: string; location: string } | null
  buyer?: { name: string } | null
  seller?: { name: string } | null
  agent?: { name: string } | null
}

export function dealDTO(d: DealWithRelations) {
  return {
    id: d.id,
    propertyId: d.propertyId,
    buyerId: d.buyerId,
    sellerId: d.sellerId,
    agentId: d.agentId,
    agreedPrice: d.agreedPrice,
    tokenAmount: d.tokenAmount,
    tokenDate: d.tokenDate ? d.tokenDate.toISOString() : null,
    finalAmount: d.finalAmount,
    finalPaymentDate: d.finalPaymentDate ? d.finalPaymentDate.toISOString() : null,
    paymentMode: d.paymentMode,
    transactionRef: d.transactionRef,
    notes: d.notes,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    propertyTitle: d.property?.title,
    propertyLocation: d.property?.location,
    buyerName: d.buyer?.name,
    sellerName: d.seller?.name,
    agentName: d.agent?.name,
  }
}

export function notificationDTO(n: Notification) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }
}
