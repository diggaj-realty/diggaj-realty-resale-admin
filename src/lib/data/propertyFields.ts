/** Allowed enum-like values for the free-form string columns (kept as String in
 *  the schema to match the source project's SQLite-era convention). */
export const FURNISHING = ['UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED'] as const
export const FACING = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'] as const
export const POSSESSION_STATUS = ['READY_TO_MOVE', 'UNDER_CONSTRUCTION'] as const
export const OWNERSHIP_TYPE = ['FREEHOLD', 'LEASEHOLD', 'POWER_OF_ATTORNEY', 'CO_OPERATIVE'] as const

/** Fallback amenity checklist used when the Amenity master table is empty. */
export const DEFAULT_AMENITIES = [
  'Lift',
  'Power Backup',
  'Car Parking',
  '24x7 Security',
  'CCTV',
  'Gymnasium',
  'Swimming Pool',
  'Clubhouse',
  "Children's Play Area",
  'Park / Garden',
  'Gated Community',
  'Water Supply',
  'Fire Safety',
  'Rain Water Harvesting',
]

/** Loosely-typed rich-field input, shared by the FormData (server action) and
 *  JSON (REST API) entry points. */
export interface RichPropertyInput {
  city?: unknown
  locality?: unknown
  pincode?: unknown
  carpetAreaSqft?: unknown
  builtUpAreaSqft?: unknown
  superBuiltUpAreaSqft?: unknown
  bathrooms?: unknown
  balconies?: unknown
  furnishing?: unknown
  facing?: unknown
  floorNumber?: unknown
  totalFloors?: unknown
  ageYears?: unknown
  parkingCovered?: unknown
  parkingOpen?: unknown
  possessionStatus?: unknown
  possessionDate?: unknown
  ownershipType?: unknown
  reraId?: unknown
  priceNegotiable?: unknown
  maintenanceMonthly?: unknown
  floorPlanUrl?: unknown
  videoUrl?: unknown
  amenities?: unknown
  builderName?: unknown
  projectName?: unknown
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const int = (v: unknown): number | undefined => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : undefined
}
const float = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
const oneOf = <T extends readonly string[]>(v: unknown, allowed: T): T[number] | undefined => {
  const s = str(v)
  return s && (allowed as readonly string[]).includes(s) ? (s as T[number]) : undefined
}
const bool = (v: unknown): boolean | undefined => {
  if (v === true || v === 'true' || v === 'on') return true
  if (v === false || v === 'false') return false
  return undefined
}
const dateOrNull = (v: unknown): Date | undefined => {
  const s = str(v)
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}
const stringArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const clean = v.map((x) => str(x)).filter((x): x is string => !!x)
  return clean
}

/** Assign only the keys that resolved to a defined, valid value so partial
 *  updates never clobber existing data with undefined. amenities is always
 *  written when provided (including an empty array = "cleared"). */
function assignDefined(target: Record<string, unknown>, entries: Record<string, unknown>) {
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) target[k] = v
  }
}

/** Normalises loose input into a Prisma-safe data patch for the rich Property
 *  columns. Invalid enum values / non-numbers are dropped rather than rejected,
 *  so a bad optional field never blocks a listing. */
export function buildRichPropertyData(input: RichPropertyInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  assignDefined(data, {
    city: str(input.city),
    locality: str(input.locality),
    pincode: str(input.pincode),
    carpetAreaSqft: float(input.carpetAreaSqft),
    builtUpAreaSqft: float(input.builtUpAreaSqft),
    superBuiltUpAreaSqft: float(input.superBuiltUpAreaSqft),
    bathrooms: int(input.bathrooms),
    balconies: int(input.balconies),
    furnishing: oneOf(input.furnishing, FURNISHING),
    facing: oneOf(input.facing, FACING),
    floorNumber: int(input.floorNumber),
    totalFloors: int(input.totalFloors),
    ageYears: int(input.ageYears),
    parkingCovered: int(input.parkingCovered),
    parkingOpen: int(input.parkingOpen),
    possessionStatus: oneOf(input.possessionStatus, POSSESSION_STATUS),
    possessionDate: dateOrNull(input.possessionDate),
    ownershipType: oneOf(input.ownershipType, OWNERSHIP_TYPE),
    reraId: str(input.reraId),
    priceNegotiable: bool(input.priceNegotiable),
    maintenanceMonthly: float(input.maintenanceMonthly),
    floorPlanUrl: str(input.floorPlanUrl),
    videoUrl: str(input.videoUrl),
    amenities: stringArray(input.amenities),
    builderName: str(input.builderName),
    projectName: str(input.projectName),
  })
  return data
}

/** Extract a RichPropertyInput from FormData (server-action entry point). */
export function richInputFromFormData(fd: FormData): RichPropertyInput {
  const g = (k: string) => fd.get(k)
  return {
    city: g('city'),
    locality: g('locality'),
    pincode: g('pincode'),
    carpetAreaSqft: g('carpetAreaSqft'),
    builtUpAreaSqft: g('builtUpAreaSqft'),
    superBuiltUpAreaSqft: g('superBuiltUpAreaSqft'),
    bathrooms: g('bathrooms'),
    balconies: g('balconies'),
    furnishing: g('furnishing'),
    facing: g('facing'),
    floorNumber: g('floorNumber'),
    totalFloors: g('totalFloors'),
    ageYears: g('ageYears'),
    parkingCovered: g('parkingCovered'),
    parkingOpen: g('parkingOpen'),
    possessionStatus: g('possessionStatus'),
    possessionDate: g('possessionDate'),
    ownershipType: g('ownershipType'),
    reraId: g('reraId'),
    priceNegotiable: g('priceNegotiable'),
    maintenanceMonthly: g('maintenanceMonthly'),
    floorPlanUrl: g('floorPlanUrl'),
    videoUrl: g('videoUrl'),
    amenities: fd.getAll('amenities').map(String),
    builderName: g('builderName'),
    projectName: g('projectName'),
  }
}
