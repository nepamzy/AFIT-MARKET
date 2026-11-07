import type { Metadata } from 'next'
import { AddRiderForm, RiderCards } from '@/components/domain/vendor-riders-form'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Section } from '@/components/ui/section'
import {
  getMyVendor,
  listVendorRiders,
} from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'My riders' }

export default async function MyRiders() {
  const me = await getMyVendor()
  if (!me) return <EmptyState title="No vendor account yet" />
  const owner = me.staff_role === 'owner'
  const ready = me.status === 'approved'
  const riders = ready ? await listVendorRiders(me.id) : []
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'My riders' }]}
        title="My riders"
        subtitle="Your own riders, who deliver only your shop’s orders."
      />
      <Card className="mb-6 space-y-2 text-sm">
        <p>
          <strong>How it works.</strong> Add a rider’s name and you get a permanent 5-digit code for
          that rider. The rider signs up as a rider in the normal way (same documents, same
          approval) and types the code in the optional “Shop code” boxes, or later on their Rider
          page.
        </p>
        <p>
          The rider is then <strong>linked to your shop</strong> and sees only your shop’s orders.
          Riders who are not linked still see every shop’s orders. You can remove a rider at any
          time.
        </p>
      </Card>
      {!ready ? (
        <EmptyState title="Available once your shop is approved" />
      ) : (
        <div className="space-y-8">
          {owner && (
            <Section id="add" title="Add a rider">
              <Card>
                <AddRiderForm vendorId={me.id} />
              </Card>
            </Section>
          )}
          <Section id="list" title="Your riders">
            <RiderCards vendorId={me.id} riders={riders} />
          </Section>
        </div>
      )}
    </>
  )
}
