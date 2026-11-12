import { cn } from './cn'

/** A product's photo. A product without one gets the branded tile from the same address, so this never fails. */
export function ProductPhoto({
  productId,
  className,
  label,
  eager,
  fresh,
}: {
  productId: string
  icon?: string
  className?: string
  label?: string
  /** the main photo of a page: fetch it first, do not wait until it scrolls into view */
  eager?: boolean
  /** the shop's own screens: always the current photo, never a cached one */
  fresh?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/products/${productId}/image${fresh ? '?fresh' : ''}`}
      alt={label ?? ''}
      width={800}
      height={600}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      className={cn(
        'aspect-[4/3] w-full overflow-hidden rounded-t-[var(--radius-card)] bg-surface object-cover',
        className,
      )}
    />
  )
}
