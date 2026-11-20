import type { Metadata } from 'next'
import { JoinShopForm } from '@/components/domain/join-shop-form'
import { RiderFreeNotice } from '@/components/domain/rider-free-notice'
import { Card, PageHeader } from '@/components/ui/card'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Deliver on AFIT Market' }

/** Every rider works for one shop. This page links a signed-in person to a shop with the shop's rider code. */
export default async function RiderApply() {
  const sb = await createSupabaseServerClient()
  const { data: link } = await sb.rpc('my_rider_link')
  const shop = (link as { vendor_name?: string } | null)?.vendor_name
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Account', href: '/account' }, { label: 'Deliver on AFIT Market' }]}
        title="Deliver on AFIT Market"
        subtitle="Riders work for a shop and deliver that shop's orders"
      />
      <div className="mb-5 max-w-xl">
        <RiderFreeNotice />
      </div>
      {shop ? (
        <Card className="max-w-xl space-y-2">
          <p className="font-semibold">You are a rider for {shop}.</p>
          <p>
            <a className="font-semibold text-brand-700 underline" href="/rider">
              Open the rider area
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
