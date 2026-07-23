'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react'
import LocationPicker, { type PickedLocation } from '@/components/dashboard/LocationPicker'
import { CITIES, FURNISHING, normalizeCity } from '@/lib/data/propertyFields'

const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'PLOT', label: 'Plot' },
  { value: 'COMMERCIAL', label: 'Commercial' },
]

const OTHER_CITY = 'Other'
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 45 * 1024 * 1024

const inputStyle = { borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }
const labelClass = 'mb-1.5 block text-xs font-semibold'

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

    const fd = new FormData(e.currentTarget)
    const photos = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
    const videos = fd.getAll('videos').filter((f): f is File => f instanceof File && f.size > 0)

    for (const f of photos) {
      if (f.size > MAX_PHOTO_SIZE_BYTES) return setError(`Photo "${f.name}" exceeds 15MB.`)
    }
    for (const f of videos) {
      if (f.size > MAX_VIDEO_SIZE_BYTES) return setError(`Video "${f.name}" exceeds 45MB.`)
    }

    setSubmitting(true)
    try {
      const photoUrls: string[] = []
      const videoUrls: string[] = []

      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}...`)
        photoUrls.push(await uploadOne(photos[i], folderRef.current))
      }
      for (let i = 0; i < videos.length; i++) {
        setProgress(`Uploading video ${i + 1} of ${videos.length}...`)
        videoUrls.push(await uploadOne(videos[i], folderRef.current))
      }

      setProgress('Submitting property details...')
      const resolvedCity = city === OTHER_CITY ? cityOther : city

      const payload = {
        sellerName: String(fd.get('sellerName') || ''),
        sellerPhone: String(fd.get('sellerPhone') || ''),
        sellerEmail: String(fd.get('sellerEmail') || ''),
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
        furnishing: String(fd.get('furnishing') || '') || undefined,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 size={40} style={{ color: 'var(--green-700)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Property submitted for review</h2>
        <p className="max-w-md text-sm" style={{ color: 'var(--text-2)' }}>
          Thanks! &ldquo;{done.title}&rdquo; has been sent to our team. We&apos;ll verify the details and reach out on the
          phone number you provided once it&apos;s approved and live.
        </p>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="btn-accent mt-2 rounded-lg px-4 py-2 text-xs font-semibold"
        >
          Submit another property
        </button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-5 p-6">
      <div>
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Your contact details</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
          So our team can reach you once the property is reviewed. No account or sign-in needed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Your name</label>
          <input type="text" name="sellerName" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Phone number</label>
          <input type="tel" name="sellerPhone" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Email (optional)</label>
          <input type="email" name="sellerEmail" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
      </div>

      <hr style={{ borderColor: 'var(--line)' }} />

      <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Property details</h2>

      <div>
        <label className={labelClass} style={{ color: 'var(--text-2)' }}>Title</label>
        <input type="text" name="title" required placeholder="e.g. Spacious 3BHK near Whitefield" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={{ color: 'var(--text-2)' }}>Description</label>
        <textarea name="description" rows={3} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
      </div>

      <div>
        <label className={labelClass} style={{ color: 'var(--text-2)' }}>Location</label>
        <input
          type="text"
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Area, City"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
      </div>

      <div>
        <label className={labelClass} style={{ color: 'var(--text-2)' }}>Pin the location on the map (optional, helps buyers find it)</label>
        <LocationPicker initialLat={lat} initialLon={lon} onPick={handleLocationPick} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>City</label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
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
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          )}
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Locality</label>
          <input type="text" value={locality} onChange={(e) => setLocality(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Pincode</label>
          <input type="text" value={pincode} onChange={(e) => setPincode(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Type</label>
          <select
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Area (sqft)</label>
          <input type="number" name="areaSqft" min={1} required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={{ color: type === 'PLOT' ? 'var(--text-3)' : 'var(--text-2)' }}>BHK</label>
          <input type="number" name="bhk" min={1} disabled={type === 'PLOT'} className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Asking price (₹)</label>
          <input type="number" name="askingPrice" min={1} required className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
      </div>

      <div>
        <label className={labelClass} style={{ color: 'var(--text-2)' }}>Furnishing</label>
        <select name="furnishing" className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle}>
          <option value="">—</option>
          {FURNISHING.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {amenityOptions.length > 0 && (
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Amenities</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {amenityOptions.map((a) => (
              <label key={a} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <input type="checkbox" checked={selectedAmenities.has(a)} onChange={() => toggleAmenity(a)} />
                {a}
              </label>
            ))}
          </div>
        </div>
      )}

      <hr style={{ borderColor: 'var(--line)' }} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Photos</label>
          <input type="file" name="photos" accept="image/*" multiple className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Up to 15MB each.</p>
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--text-2)' }}>Videos (optional)</label>
          <input type="file" name="videos" accept="video/*" multiple className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Up to 45MB each.</p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg px-4 py-2.5 text-sm" style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-accent flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-70"
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
