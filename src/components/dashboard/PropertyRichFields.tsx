'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { FURNISHING, FACING, POSSESSION_STATUS, OWNERSHIP_TYPE } from '@/lib/data/propertyFields'
import { BUILDER_NAMES, projectsForBuilder } from '@/lib/data/builders'
import { formatMoneyHint } from '@/lib/format'

const OTHER_BUILDER = 'Other / not listed'

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }
const labelClass = 'mb-1.5 block text-xs font-semibold'

export interface PropertyRichDefaults {
  city?: string | null
  locality?: string | null
  pincode?: string | null
  carpetAreaSqft?: number | null
  builtUpAreaSqft?: number | null
  superBuiltUpAreaSqft?: number | null
  bathrooms?: number | null
  balconies?: number | null
  furnishing?: string | null
  facing?: string | null
  floorNumber?: number | null
  totalFloors?: number | null
  ageYears?: number | null
  parkingCovered?: number | null
  parkingOpen?: number | null
  possessionStatus?: string | null
  possessionDate?: string | Date | null
  ownershipType?: string | null
  reraId?: string | null
  priceNegotiable?: boolean | null
  maintenanceMonthly?: number | null
  amenities?: string[] | null
  builderName?: string | null
  projectName?: string | null
}

function toDateInputValue(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** Collapsible "More details" section shared by Add/Edit listing forms — RERA
 *  area breakdown, configuration, legal/commercial, and amenities checklist.
 *  All fields optional; the parent <form> owns submission. */
export default function PropertyRichFields({
  amenityOptions,
  defaults,
}: {
  amenityOptions: string[]
  defaults?: PropertyRichDefaults
}) {
  const [open, setOpen] = useState(!!defaults) // start expanded when editing existing data
  const d = defaults ?? {}

  const builderKnown = !!d.builderName && BUILDER_NAMES.includes(d.builderName)
  const [builder, setBuilder] = useState(builderKnown ? d.builderName! : d.builderName ? OTHER_BUILDER : '')
  const projectOptions = projectsForBuilder(builder === OTHER_BUILDER ? undefined : builder)
  const [maintenanceMonthly, setMaintenanceMonthly] = useState(d.maintenanceMonthly != null ? String(d.maintenanceMonthly) : '')

  return (
    <div className="border-t pt-5" style={{ borderColor: 'var(--line)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-bold"
        style={{ color: 'var(--text-1)' }}
      >
        More details (location, area, amenities)
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>City</label>
              <input type="text" name="city" defaultValue={d.city ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Locality</label>
              <input type="text" name="locality" defaultValue={d.locality ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Pincode</label>
              <input type="text" name="pincode" defaultValue={d.pincode ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Builder</label>
              <select
                name={builder === OTHER_BUILDER ? undefined : 'builderName'}
                value={builder}
                onChange={(e) => setBuilder(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                {BUILDER_NAMES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value={OTHER_BUILDER}>{OTHER_BUILDER}</option>
              </select>
              {builder === OTHER_BUILDER && (
                <input
                  type="text"
                  name="builderName"
                  placeholder="Builder name"
                  defaultValue={builderKnown ? '' : d.builderName ?? ''}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              )}
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Project name</label>
              {projectOptions.length > 0 ? (
                <select
                  name="projectName"
                  defaultValue={d.projectName ?? ''}
                  key={builder}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  name="projectName"
                  placeholder="Project name"
                  defaultValue={d.projectName ?? ''}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Carpet area (sqft)</label>
              <input type="number" name="carpetAreaSqft" min={1} defaultValue={d.carpetAreaSqft ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Built-up area (sqft)</label>
              <input type="number" name="builtUpAreaSqft" min={1} defaultValue={d.builtUpAreaSqft ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Super built-up area (sqft)</label>
              <input type="number" name="superBuiltUpAreaSqft" min={1} defaultValue={d.superBuiltUpAreaSqft ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Bathrooms</label>
              <input type="number" name="bathrooms" min={0} defaultValue={d.bathrooms ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Balconies</label>
              <input type="number" name="balconies" min={0} defaultValue={d.balconies ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Parking (covered)</label>
              <input type="number" name="parkingCovered" min={0} defaultValue={d.parkingCovered ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Parking (open)</label>
              <input type="number" name="parkingOpen" min={0} defaultValue={d.parkingOpen ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Furnishing</label>
              <select name="furnishing" defaultValue={d.furnishing ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {FURNISHING.map((f) => (
                  <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Facing</label>
              <select name="facing" defaultValue={d.facing ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {FACING.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Age (years)</label>
              <input type="number" name="ageYears" min={0} defaultValue={d.ageYears ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Floor number</label>
              <input type="number" name="floorNumber" min={0} defaultValue={d.floorNumber ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Total floors</label>
              <input type="number" name="totalFloors" min={0} defaultValue={d.totalFloors ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Possession status</label>
              <select name="possessionStatus" defaultValue={d.possessionStatus ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {POSSESSION_STATUS.map((p) => (
                  <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Possession date</label>
              <input type="date" name="possessionDate" defaultValue={toDateInputValue(d.possessionDate)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Ownership type</label>
              <select name="ownershipType" defaultValue={d.ownershipType ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                {OWNERSHIP_TYPE.map((o) => (
                  <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>RERA ID</label>
              <input type="text" name="reraId" defaultValue={d.reraId ?? ''} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--text-2)' }}>Monthly maintenance (₹)</label>
              <input
                type="number"
                name="maintenanceMonthly"
                min={0}
                value={maintenanceMonthly}
                onChange={(e) => setMaintenanceMonthly(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
              {maintenanceMonthly && Number(maintenanceMonthly) > 0 && (
                <p className="mt-1 text-xs font-medium" style={{ color: 'var(--accent-700)' }}>
                  ≈ ₹{formatMoneyHint(Number(maintenanceMonthly))}
                </p>
              )}
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                <input type="checkbox" name="priceNegotiable" defaultChecked={!!d.priceNegotiable} />
                Price negotiable
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass} style={{ color: 'var(--text-2)' }}>Amenities</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {amenityOptions.map((a) => (
                <label key={a} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                  <input type="checkbox" name="amenities" value={a} defaultChecked={d.amenities?.includes(a) ?? false} />
                  {a}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
