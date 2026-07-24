/** Small row of square photo thumbnails — e.g. recent-property previews under a stat card. */
export default function FilmstripThumbnails({ photos }: { photos: { photoUrl: string; alt?: string }[] }) {
  if (photos.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      {photos.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={p.photoUrl}
          alt={p.alt ?? ''}
          className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
          style={{ border: '1px solid var(--line)' }}
        />
      ))}
    </div>
  )
}
