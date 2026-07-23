'use client'

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Loader2, UploadCloud, User, Home, MapPin, Ruler,
  ScrollText, Building2, Sparkles, Images, X, ImageIcon, Video,
} from 'lucide-react'
import LocationPicker, { type PickedLocation } from '@/components/dashboard/LocationPicker'
import { CITIES, FURNISHING, FACING, POSSESSION_STATUS, OWNERSHIP_TYPE, normalizeCity } from '@/lib/data/propertyFields'
import { BUILDER_NAMES, projectsForBuilder } from '@/lib/data/builders'

const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'PLOT', label: 'Plot' },
  { value: 'COMMERCIAL', label: 'Commercial' },
]

const OTHER_CITY = 'Other'
const OTHER_BUILDER = 'Other / not listed'
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 45 * 1024 * 1024

// Matches the diggajrealty.com marketing site's LeadForm field styling
// (bg-ink/5, ring-ink/10, focus:ring-lime) rather than the internal dashboard's.
const field =
  'w-full rounded-2xl bg-[#1c1a16]/5 px-4 py-3 text-sm text-[#1c1a16] ring-1 ring-[#1c1a16]/10 placeholder:text-[#1c1a16]/40 outline-none transition-shadow focus:ring-2 focus:ring-[#cdea6f]'
const labelClass = 'mb-1.5 block text-xs font-semibold text-[#1c1a16]/70'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_6px_rgba(28,26,22,0.05),0_8px_24px_rgba(28,26,22,0.04)] sm:p-8">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#eefed4] text-[#1c1a16]">
          <Icon size={16} />
        </span>
        <div>
          <h2 className="text-base font-medium tracking-[-0.01em] text-[#1c1a16]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[#1c1a16]/50">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function FileDropzone({
  icon: Icon,
  label,
  hint,
  accept,
  files,
  onAdd,
  onRemove,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  hint: string
  accept: string
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}) {
  const inputId = `dropzone-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#1c1a16]/15 bg-[#1c1a16]/[0.03] px-4 py-7 text-center transition-colors hover:border-[#cdea6f] hover:bg-[#eefed4]/40"
      >
        <Icon size={20} className="text-[#1c1a16]/60" />
        <p className="text-xs font-semibold text-[#1c1a16]/70">Click to choose files, or drag them here</p>
        <p className="text-[11px] text-[#1c1a16]/40">{hint}</p>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length > 0) onAdd(picked)
            e.target.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-[#1c1a16]/[0.04] px-3 py-1.5 text-xs text-[#1c1a16]/70"
            >
              <span className="truncate">{f.name} <span className="text-[#1c1a16]/40">· {formatBytes(f.size)}</span></span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                aria-label={`Remove ${f.name}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

async function uploadOne(file: File, folder: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('folder', folder)
  const res = await fetch('/api/v1/public/uploads', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `Failed to upload "${file.name}"`)
  return json.data.url as string
}

export default function PublicListingForm({ amenityOptions }: { amenityOptions: string[] }) {
  const folderRef = useRef(crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)

  const [type, setType] = useState('RESIDENTIAL')
  const [location, setLocation] = useState('')
  const autoLocationRef = useRef('')
  const [city, setCity] = useState('')
  const [cityOther, setCityOther] = useState('')
  const [locality, setLocality] = useState('')
  const [pincode, setPincode] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [selectedAmenities, setSelectedAmenities] = useState<Set<string>>(new Set())
  const [builder, setBuilder] = useState('')
  const [builderOther, setBuilderOther] = useState('')
  const [projectName, setProjectName] = useState('')
  const projectOptions = projectsForBuilder(builder === OTHER_BUILDER ? undefined : builder)
  const [priceNegotiable, setPriceNegotiable] = useState(false)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ title: string } | null>(null)

  function handleLocationPick(loc: PickedLocation) {
    setLat(loc.lat)
    setLon(loc.lon)
    if (loc.city) {
      const normalized = normalizeCity(loc.city)
      setCity(CITIES.includes(normalized as (typeof CITIES)[number]) ? normalized : OTHER_CITY)
      if (!CITIES.includes(normalized as (typeof CITIES)[number])) setCityOther(normalized)
    }
    if (loc.locality) setLocality(loc.locality)
    if (loc.pincode) setPincode(loc.pincode)

    const suggested = [loc.locality, loc.city].filter(Boolean).join(', ')
    if (suggested) {
      setLocation((prev) => (prev === '' || prev === autoLocationRef.current ? suggested : prev))
      autoLocationRef.current = suggested
    }
  }

  function toggleAmenity(name: string) {
    setSelectedAmenities((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    for (const f of photoFiles) {
      if (f.size > MAX_PHOTO_SIZE_BYTES) return setError(`Photo "${f.name}" exceeds 15MB.`)
    }
    for (const f of videoFiles) {
      if (f.size > MAX_VIDEO_SIZE_BYTES) return setError(`Video "${f.name}" exceeds 45MB.`)
    }

    const fd = new FormData(e.currentTarget)
    setSubmitting(true)
    try {
      const photoUrls: string[] = []
      const videoUrls: string[] = []

      for (let i = 0; i < photoFiles.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photoFiles.length}...`)
        photoUrls.push(await uploadOne(photoFiles[i], folderRef.current))
      }
      for (let i = 0; i < videoFiles.length; i++) {
        setProgress(`Uploading video ${i + 1} of ${videoFiles.length}...`)
        videoUrls.push(await uploadOne(videoFiles[i], folderRef.current))
      }

      setProgress('Submitting property details...')
      const resolvedCity = city === OTHER_CITY ? cityOther : city
      const resolvedBuilder = builder === OTHER_BUILDER ? builderOther : builder
      const num = (key: string) => {
        const v = fd.get(key)
        return v && String(v).trim() ? Number(v) : undefined
      }
      const str = (key: string) => {
        const v = fd.get(key)
        return v && String(v).trim() ? String(v).trim() : undefined
      }

      const payload = {
        sellerName: String(fd.get('sellerName') || ''),
        sellerPhone: String(fd.get('sellerPhone') || ''),
        sellerEmail: String(fd.get('sellerEmail') || ''),
        referralName: String(fd.get('referralName') || ''),
        title: String(fd.get('title') || ''),
        description: String(fd.get('description') || ''),
        location,
        type,
        areaSqft: Number(fd.get('areaSqft')),
        bhk: type === 'PLOT' ? null : fd.get('bhk') ? Number(fd.get('bhk')) : null,
        askingPrice: Number(fd.get('askingPrice')),
        city: resolvedCity || undefined,
        locality: locality || undefined,
        pincode: pincode || undefined,
        latitude: lat ?? undefined,
        longitude: lon ?? undefined,
        carpetAreaSqft: num('carpetAreaSqft'),
        builtUpAreaSqft: num('builtUpAreaSqft'),
        superBuiltUpAreaSqft: num('superBuiltUpAreaSqft'),
        bathrooms: num('bathrooms'),
        balconies: num('balconies'),
        furnishing: str('furnishing'),
        facing: str('facing'),
        floorNumber: num('floorNumber'),
        totalFloors: num('totalFloors'),
        ageYears: num('ageYears'),
        parkingCovered: num('parkingCovered'),
        parkingOpen: num('parkingOpen'),
        possessionStatus: str('possessionStatus'),
        possessionDate: str('possessionDate'),
        ownershipType: str('ownershipType'),
        reraId: str('reraId'),
        priceNegotiable,
        maintenanceMonthly: num('maintenanceMonthly'),
        builderName: resolvedBuilder || undefined,
        projectName: projectName || undefined,
        amenities: Array.from(selectedAmenities),
        photoUrls,
        videoUrls,
      }

      const res = await fetch('/api/v1/public/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'Something went wrong. Please try again.')

      setDone({ title: json.data.title })
      formRef.current?.reset()
      setPhotoFiles([])
      setVideoFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-[28px] bg-[#eefed4] px-8 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#cdea6f] text-2xl text-[#1c1a16]">
          ✓
        </span>
        <p className="mt-5 text-xl font-medium text-[#1c1a16]">Property submitted for review</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[#1c1a16]/60">
          Thanks! &ldquo;{done.title}&rdquo; has been sent to our team. We&apos;ll verify the details and reach out on the
          phone number you provided once it&apos;s approved and live.
        </p>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="mt-6 text-xs font-semibold text-[#1c1a16] underline underline-offset-4"
        >
          Submit another property
        </button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Section icon={User} title="Your contact details" subtitle="So our team can reach you once the property is reviewed. No account or sign-in needed.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Your name</label>
            <input type="text" name="sellerName" required className={field} />
          </div>
          <div>
            <label className={labelClass}>Phone number</label>
            <input type="tel" name="sellerPhone" required className={field} />
          </div>
          <div>
            <label className={labelClass}>Email (optional)</label>
            <input type="email" name="sellerEmail" className={field} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Referred by (optional)</label>
          <input
            type="text"
            name="referralName"
            placeholder="Name of the person/agent who referred you, if any"
            className={`max-w-sm ${field}`}
          />
        </div>
      </Section>

      <Section icon={Home} title="Property basics">
        <div>
          <label className={labelClass}>Title</label>
          <input type="text" name="title" required placeholder="e.g. Spacious 3BHK near Whitefield" className={field} />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea name="description" rows={3} className={`${field} resize-none`} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Type</label>
            <select required value={type} onChange={(e) => setType(e.target.value)} className={field}>
              {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Area (sqft)</label>
            <input type="number" name="areaSqft" min={1} required className={field} />
          </div>
          <div>
            <label className={`${labelClass} ${type === 'PLOT' ? 'opacity-40' : ''}`}>BHK</label>
            <input type="number" name="bhk" min={1} disabled={type === 'PLOT'} className={`${field} disabled:opacity-40`} />
          </div>
          <div>
            <label className={labelClass}>Asking price (₹)</label>
            <input type="number" name="askingPrice" min={1} required className={field} />
          </div>
        </div>
      </Section>

      <Section icon={MapPin} title="Location">
        <div>
          <label className={labelClass}>Location</label>
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Area, City"
            className={field}
          />
        </div>
        <div>
          <label className={labelClass}>Pin the location on the map (optional, helps buyers find it)</label>
          <LocationPicker initialLat={lat} initialLon={lon} onPick={handleLocationPick} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
              <option value="">—</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value={OTHER_CITY}>{OTHER_CITY}</option>
            </select>
            {city === OTHER_CITY && (
              <input
                type="text"
                placeholder="City name"
                value={cityOther}
                onChange={(e) => setCityOther(e.target.value)}
                className={`mt-2 ${field}`}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Locality</label>
            <input type="text" value={locality} onChange={(e) => setLocality(e.target.value)} className={field} />
          </div>
          <div>
            <label className={labelClass}>Pincode</label>
            <input type="text" value={pincode} onChange={(e) => setPincode(e.target.value)} className={field} />
          </div>
        </div>
      </Section>

      <Section icon={Ruler} title="Specifications" subtitle="All optional, but the more detail you add, the better buyers can judge fit.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Carpet area (sqft)</label>
            <input type="number" name="carpetAreaSqft" min={1} className={field} />
          </div>
          <div>
            <label className={labelClass}>Built-up area (sqft)</label>
            <input type="number" name="builtUpAreaSqft" min={1} className={field} />
          </div>
          <div>
            <label className={labelClass}>Super built-up (sqft)</label>
            <input type="number" name="superBuiltUpAreaSqft" min={1} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Bathrooms</label>
            <input type="number" name="bathrooms" min={0} className={field} />
          </div>
          <div>
            <label className={labelClass}>Balconies</label>
            <input type="number" name="balconies" min={0} className={field} />
          </div>
          <div>
            <label className={labelClass}>Parking (covered)</label>
            <input type="number" name="parkingCovered" min={0} className={field} />
          </div>
          <div>
            <label className={labelClass}>Parking (open)</label>
            <input type="number" name="parkingOpen" min={0} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Furnishing</label>
            <select name="furnishing" className={field}>
              <option value="">—</option>
              {FURNISHING.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Facing</label>
            <select name="facing" className={field}>
              <option value="">—</option>
              {FACING.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Age (years)</label>
            <input type="number" name="ageYears" min={0} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Floor number</label>
            <input type="number" name="floorNumber" min={0} className={field} />
          </div>
          <div>
            <label className={labelClass}>Total floors</label>
            <input type="number" name="totalFloors" min={0} className={field} />
          </div>
        </div>
      </Section>

      <Section icon={ScrollText} title="Legal & pricing details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Possession status</label>
            <select name="possessionStatus" className={field}>
              <option value="">—</option>
              {POSSESSION_STATUS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Possession date</label>
            <input type="date" name="possessionDate" className={field} />
          </div>
          <div>
            <label className={labelClass}>Ownership type</label>
            <select name="ownershipType" className={field}>
              <option value="">—</option>
              {OWNERSHIP_TYPE.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>RERA ID (optional)</label>
            <input type="text" name="reraId" className={field} />
          </div>
          <div>
            <label className={labelClass}>Monthly maintenance (₹)</label>
            <input type="number" name="maintenanceMonthly" min={0} className={field} />
          </div>
          <div className="flex items-end pb-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#1c1a16]/70">
              <input type="checkbox" checked={priceNegotiable} onChange={(e) => setPriceNegotiable(e.target.checked)} className="accent-[#cdea6f]" />
              Price negotiable
            </label>
          </div>
        </div>
      </Section>

      <Section icon={Building2} title="Builder & project" subtitle="Optional — helps buyers searching by a specific project.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Builder</label>
            <select
              value={builder}
              onChange={(e) => { setBuilder(e.target.value); setProjectName('') }}
              className={field}
            >
              <option value="">—</option>
              {BUILDER_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value={OTHER_BUILDER}>{OTHER_BUILDER}</option>
            </select>
            {builder === OTHER_BUILDER && (
              <input
                type="text"
                placeholder="Builder name"
                value={builderOther}
                onChange={(e) => setBuilderOther(e.target.value)}
                className={`mt-2 ${field}`}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Project name</label>
            {projectOptions.length > 0 ? (
              <select value={projectName} onChange={(e) => setProjectName(e.target.value)} className={field}>
                <option value="">—</option>
                {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={field}
              />
            )}
          </div>
        </div>
      </Section>

      {amenityOptions.length > 0 && (
        <Section icon={Sparkles} title="Amenities">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {amenityOptions.map((a) => {
              const checked = selectedAmenities.has(a)
              return (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                    checked ? 'bg-[#171717] text-white' : 'bg-[#1c1a16]/5 text-[#1c1a16]/70'
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleAmenity(a)} className="accent-[#cdea6f]" />
                  {a}
                </label>
              )
            })}
          </div>
        </Section>
      )}

      <Section icon={Images} title="Photos & videos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FileDropzone
            icon={ImageIcon}
            label="Photos"
            hint="Up to 15MB each"
            accept="image/*"
            files={photoFiles}
            onAdd={(files) => setPhotoFiles((prev) => [...prev, ...files])}
            onRemove={(i) => setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
          <FileDropzone
            icon={Video}
            label="Videos (optional)"
            hint="Up to 45MB each"
            accept="video/*"
            files={videoFiles}
            onAdd={(files) => setVideoFiles((prev) => [...prev, ...files])}
            onRemove={(i) => setVideoFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>
      </Section>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#cdea6f] px-6 py-3.5 text-sm font-semibold text-[#1c1a16] transition-opacity disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 size={15} className="animate-spin" /> {progress || 'Submitting...'}
          </>
        ) : (
          <>
            <UploadCloud size={15} /> Submit property for review
          </>
        )}
      </button>
    </form>
  )
}
