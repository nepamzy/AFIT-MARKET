/** The AI-made picture for one of the three people AFIT Market is for. Decorative: the words beside it say everything. */
const SRC = {
  customer: '/art/role-customer.webp',
  vendor: '/art/role-vendor.webp',
  rider: '/art/role-rider.webp',
} as const

export type RoleKind = keyof typeof SRC

export function RolePhoto({ kind, className = '' }: { kind: RoleKind; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[kind]}
      alt=""
      width={480}
      height={480}
      decoding="async"
      className={`aspect-square rounded-2xl object-cover ${className}`}
    />
  )
}
