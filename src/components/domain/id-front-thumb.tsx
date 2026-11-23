/** A small picture of the front of a student's ID card, for the admin lists. Tap it to open it full size in a new tab. */
export function IdFrontThumb({ userId, kind }: { userId: string; kind: 'vendor' | 'rider' }) {
  const src = `/api/admin/id-cards/${userId}/${kind}/front`
  return (
    <a href={src} target="_blank" rel="noopener" className="shrink-0" title="Open the ID card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Front of the student ID card"
        loading="lazy"
        className="h-20 w-32 rounded-[var(--radius-control)] border border-line object-cover"
      />
    </a>
  )
}
