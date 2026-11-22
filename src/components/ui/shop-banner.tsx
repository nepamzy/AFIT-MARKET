import { cn } from './cn'

/** A shop's banner: its own picture, or a drawn shop front (the address decides). */
export function ShopBanner({ slug, className }: { slug: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/vendors/${slug}/banner`}
      alt=""
      loading="lazy"
      className={cn('w-full object-cover', className)}
    />
  )
}
