import { cn } from './cn'

/**
 * A shop's banner: its own picture, or a drawn shop front (the address decides). The whole picture is always shown,
 * never cut: by default at its own shape; in a fixed-shape box (`boxed`) it is fitted inside, with a calm background.
 */
export function ShopBanner({
  slug,
  className,
  boxed = false,
}: {
  slug: string
  className?: string
  /** Fit inside a box of the given shape (for a grid of cards) instead of taking the picture's own height. */
  boxed?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/vendors/${slug}/banner`}
      alt=""
      loading="lazy"
      className={cn(
        'w-full',
        boxed ? 'bg-navy-50 object-contain' : 'h-auto',
        className,
      )}
    />
  )
}
