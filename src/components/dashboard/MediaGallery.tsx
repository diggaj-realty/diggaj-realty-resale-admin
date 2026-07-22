'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { deletePropertyMedia } from '@/lib/actions/media'

export default function MediaGallery({
  photos,
  canEdit,
}: {
  photos: { id: string; photoUrl: string; mediaType: string }[]
  canEdit: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string | null>(null)

  function handleRemove(id: string) {
    if (!confirm('Remove this photo/video? This cannot be undone.')) return
    setRemovingId(id)
    startTransition(async () => {
      try {
        await deletePropertyMedia(id)
      } finally {
        setRemovingId(null)
      }
    })
  }

  if (photos.length === 0) {
    return (
      <div
        className="flex aspect-[3/1] w-full items-center justify-center rounded-lg border border-dashed text-sm"
        style={{ borderColor: 'var(--line)', color: 'var(--text-3)', background: 'var(--surface-2)' }}
      >
        No photos or videos uploaded yet
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          {photo.mediaType === 'VIDEO' ? (
            <video
              src={photo.photoUrl}
              controls
              className="aspect-square w-full rounded-lg border object-cover"
              style={{ borderColor: 'var(--line)' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.photoUrl} alt="" className="aspect-square w-full rounded-lg border object-cover" style={{ borderColor: 'var(--line)' }} />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => handleRemove(photo.id)}
              disabled={pending && removingId === photo.id}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-60"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              title="Remove"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
