import type { Metadata } from 'next'
import { JoinShopForm } from '@/components/domain/join-shop-form'
import { Card, PageHeader } from '@/components/ui/card'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Join a shop' }

/** For a rider who already has an account: link it to a shop with the shop's rider code. */
export default async function JoinShop() {
  const sb = await createSupabaseServerClient()
  const { data: link } = await sb.rpc('my_rider_link')
  const shop = (link as { vendor_name?: string } | null)?.vendor_name
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Rider', href: '/rider' }, { label: 'Join a shop' }]}
        title="Join a shop"
        subtitle="Every rider works for one shop and sees only that shop's orders"
      />
      {shop ? (
        <Card className="max-w-xl space-y-2">
          <p className="font-semibold">You are a rider for {shop}.</p>
          <p>
            <a className="font-semibold text-brand-700 underline" href="/rider/jobs">
              Open my jobs
            </a>
          </p>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <JoinShopForm />
        </Card>
      )}
    </>
  )
}
