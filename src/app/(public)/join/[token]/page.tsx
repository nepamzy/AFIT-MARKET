import type { Metadata } from 'next'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { loadPrincipal } from '@/server/modules/identity-and-access/guard'
import { claimInviteAction } from '@/server/modules/vendor-invites/actions'
import { checkInvite } from '@/server/modules/vendor-invites/invites'

const INVITE_TITLE = 'You are invited to sell on AFIT Market'
const INVITE_TEXT =
  'Your personal beta invitation for your shop on AFIT Market. The link works once.'
// spelled out in full so the link preview (WhatsApp and others) always shows the AFIT Market picture
export const metadata: Metadata = {
  title: 'Your AFIT Market invitation',
  description: INVITE_TEXT,
  openGraph: {
    type: 'website',
    siteName: 'AFIT Market',
    title: INVITE_TITLE,
    description: INVITE_TEXT,
    locale: 'en_NG',
    images: [{ url: '/brand/share.jpg', width: 1200, height: 630, alt: 'AFIT Market' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: INVITE_TITLE,
    description: INVITE_TEXT,
    images: ['/brand/share.jpg'],
  },
}
export const dynamic = 'force-dynamic'

/** A personal invitation link for a shop. It works once: it is used up when the shop's account is made. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const [invite, who] = await Promise.all([checkInvite(token), loadPrincipal()])
  if (!invite)
    return (
      <>
        <PageHeader title="This invitation cannot be used" />
        <Card className="max-w-xl space-y-2">
          <p>
            This invitation link is wrong, has already been used, or was cancelled. Each link works
            once. Ask AFIT Market for a new one.
          </p>
        </Card>
      </>
    )
  return (
    <>
      <PageHeader
        title="You are invited to sell on AFIT Market"
        subtitle="A personal beta invitation for your shop"
      />
      <Card className="max-w-xl space-y-4">
        {invite.label && <p className="font-semibold">Invitation for: {invite.label}</p>}
        <p>
          This link is only for you and works <strong>once</strong>. Create your shop account, send
          your shop details for <strong>final approval</strong>, and then add your riders from your
          Riders page.
        </p>
        <p
          role="note"
          className="rounded-[var(--radius-control)] border-l-4 border-danger-700 bg-danger-50 px-3 py-2 font-bold text-danger-700"
        >
          Add your account details for payout. This is essential.
        </p>
        {who.authenticated ? (
          <form action={claimInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="gold">
              Use this invitation on my account
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/signup?invite=${token}`} variant="gold">
              Create my shop account
            </ButtonLink>
            <ButtonLink href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
              I already have an account
            </ButtonLink>
          </div>
        )}
      </Card>
    </>
  )
}
