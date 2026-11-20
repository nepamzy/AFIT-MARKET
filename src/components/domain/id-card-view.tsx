/** An applicant's ID card pictures, for administrators: both sides side by side, each opens full size in a new tab. */
export function IdCardView({
  userId,
  kind,
  sent,
}: {
  userId: string
  kind: 'vendor' | 'rider'
  sent: boolean
}) {
  if (!sent)
    return (
      <p className="text-sm" data-testid="id-card-missing">
        <strong>ID card:</strong> none sent
      </p>
    )
  const sides: [string, string][] = [
    ['front', 'Front (QR code)'],
    ['back', 'Back (writing)'],
  ]
  return (
    <div className="space-y-1" data-testid="id-card">
      <p className="text-sm font-bold">ID card</p>
      <div className="flex flex-wrap gap-3">
        {sides.map(([side, label]) => {
          const src = `/api/admin/id-cards/${userId}/${kind}/${side}`
          return (
            <a key={side} href={src} target="_blank" rel="noopener" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${label} of the ID card`}
                loading="lazy"
                className="h-36 rounded-[var(--radius-control)] border border-line"
              />
              <span className="block text-xs text-muted">{label} · tap to enlarge</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
