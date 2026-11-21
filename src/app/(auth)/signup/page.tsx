import type { Metadata } from 'next'
import { SignUpForm } from '@/components/auth/forms'
import { Card } from '@/components/ui/card'
import { listCategories } from '@/server/modules/vendors-and-catalogue/public'
import { checkInvite, vendorInviteOnly } from '@/server/modules/vendor-invites/invites'

export const metadata: Metadata = { title: 'Create account' }
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const sp = await searchParams
  const [categories, onlyInvited] = await Promise.all([listCategories(), vendorInviteOnly()])
  // a good personal invitation link for a shop (checked again, and used up, when the account is made)
  const invite = sp.invite && (await checkInvite(sp.invite)) ? sp.invite : ''
  return (
    <Card>
      <h1 className="mb-4 text-2xl font-bold">
        {invite ? 'Create your shop account' : 'Create your account'}
      </h1>
      <SignUpForm
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        invite={invite}
        vendorInviteOnly={onlyInvited}
      />
    </Card>
  )
}
