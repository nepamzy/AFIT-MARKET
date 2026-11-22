import { WhatsAppLogo } from '@/components/landing/whatsapp'
import { WHATSAPP_CHANNEL_URL } from '@/lib/contact'
import { cn } from '@/components/ui/cn'

/** An invitation to the AFIT Market WhatsApp Channel. One tap; the channel opens in WhatsApp. */
export function ChannelCard({ className }: { className?: string }) {
  return (
    <aside
      aria-label="AFIT Market WhatsApp Channel"
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-card p-4 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <WhatsAppLogo size={44} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold text-navy-900">Be the first to know 📣</p>
        <p className="text-sm text-muted">
          New shops, hot campus deals, delivery news and opening dates. Join the AFIT Market channel
          and never miss a thing. One tap, no noise.
        </p>
      </div>
      <a
        href={WHATSAPP_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="touch-target inline-flex items-center justify-center rounded-full bg-[rgb(37_211_102)] px-5 py-2.5 font-bold text-navy-900 transition hover:brightness-95"
      >
        Join the channel
      </a>
    </aside>
  )
}
