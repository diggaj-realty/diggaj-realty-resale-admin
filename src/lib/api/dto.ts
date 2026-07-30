import type {
  User,
  Property,
  PropertyPhoto,
  Offer,
  OfferEvent,
  Deal,
  DealDocument,
  SellerKyc,
  Notification,
  OfflineNegotiation,
  PaymentRequest,
} from '@prisma/client'
import { buyerFacingOfferStatus } from '@/lib/data/dashboard'

export function userDTO(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    roles: u.roles.length > 0 ? u.roles : [u.role],
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
    requestedPlan: p.requestedPlan,
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
  events?: OfferEvent[]
}

/** Buyer/seller-facing negotiation timeline entry. actorId (an internal user id)
 *  is deliberately omitted — actorRole ("BUYER"/"SELLER"/"BACKEND") is enough
 *  context for a timeline without exposing another party's raw id. */
function offerEventDTO(e: OfferEvent) {
  return {
    id: e.id,
    type: e.type,
    amount: e.amount,
    actorRole: e.actorRole,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }
}

export function offerDTO(o: OfferWithRelations, opts?: { forBuyer?: boolean }) {
  // Negotiation can go back and forth indefinitely (no round limit) — these
  // two derived fields tell the client whose move it is and what number is
  // currently on the table, without reimplementing the turn logic from
  // src/app/api/v1/offers/[id]/route.ts. Only meaningful while PENDING/COUNTERED.
  const isActive = o.status === 'PENDING' || o.status === 'COUNTERED'
  const turn = isActive ? (o.status === 'PENDING' ? 'SELLER' : o.counterBy === 'BUYER' ? 'SELLER' : 'BUYER') : null

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
    currentAmount: o.counterAmount ?? o.amount,
    turn,
    reviewedBy: o.reviewedBy,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    propertyTitle: o.property?.title,
    propertyLocation: o.property?.location,
    buyerName: o.buyer?.name,
    ...(o.events ? { events: o.events.map(offerEventDTO) } : {}),
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

export function dealDocumentDTO(d: DealDocument) {
  return {
    id: d.id,
    dealId: d.dealId,
    docType: d.docType,
    requiredFrom: d.requiredFrom,
    fileUrl: d.fileUrl,
    status: d.status,
    remarks: d.remarks,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

type OfflineNegotiationWithRelations = OfflineNegotiation & {
  recordedBy?: { name: string } | null
}

export function offlineNegotiationDTO(n: OfflineNegotiationWithRelations) {
  return {
    id: n.id,
    dealId: n.dealId,
    agreedAmount: n.agreedAmount,
    buyerConfirmed: n.buyerConfirmed,
    sellerConfirmed: n.sellerConfirmed,
    buyerActedAt: n.buyerActedAt?.toISOString() ?? null,
    sellerActedAt: n.sellerActedAt?.toISOString() ?? null,
    // Exposed so the buyer's own screen can show the figure with its real
    // standing — "awaiting your confirmation" vs "agreed by both sides" vs
    // "you've queried this" — instead of a bare number.
    bothConfirmed: n.buyerConfirmed && n.sellerConfirmed,
    disputedBy: n.disputedBy,
    disputedNote: n.disputedNote,
    disputedAt: n.disputedAt?.toISOString() ?? null,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
    isDisputeOpen: n.disputedAt != null && n.resolvedAt == null,
    /** False once a newer figure has been recorded — respond to the live one. */
    isCurrent: n.supersededAt == null,
    notes: n.notes,
    recordedById: n.recordedById,
    recordedByName: n.recordedBy?.name,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }
}

type PaymentRequestWithRelations = PaymentRequest & {
  createdBy?: { name: string } | null
}

export function paymentRequestDTO(r: PaymentRequestWithRelations) {
  return {
    id: r.id,
    dealId: r.dealId,
    recipient: r.recipient,
    amount: r.amount,
    purpose: r.purpose,
    title: r.title,
    description: r.description,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    status: r.status,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    paymentRef: r.paymentRef,
    createdById: r.createdById,
    createdByName: r.createdBy?.name,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
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
