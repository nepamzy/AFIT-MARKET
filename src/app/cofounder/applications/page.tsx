import type { Metadata } from 'next'
import { ActionForm } from '@/components/forms/action-form'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { formatNaira } from '@/lib/money'
import { lagosDate } from '@/lib/time'
import { approveShopAction } from '@/server/modules/cofounder/portal-actions'
import { portalApplications } from '@/server/modules/cofounder/portal'

export const metadata: Metadata = { title: 'Shop applications' }
export const dynamic = 'force-dynamic'

export default async function CofounderApplications() {
  const [waiting, approved] = await Promise.all([
    portalApplications('pending'),
    portalApplications('approved'),
  ])
  if (!waiting || !approved)
    return (
      <EmptyState title="We could not load applications" icon="alert">
        Please try again.
      </EmptyState>
    )
  return (
    <>
      <PageHeader
        title="Shop applications"
        subtitle="Check each shop, then approve it. Your name goes on every shop you approve and the founder is told at once. ID cards, e-mail and bank details are not shown here."
      />
      <h2 className="mb-3 text-xl font-extrabold text-navy-900">Waiting for review</h2>
      {waiting.length === 0 ? (
        <EmptyState title="Nothing is waiting" icon="check-circle">
          New applications appear here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {waiting.map((a) => (
            <Card key={a.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-navy-900">{a.business_name}</h3>
                <Badge tone="warning">Waiting</Badge>
              </div>
              <p className="text-sm text-muted">
                {a.applicant_name} · {a.contact_phone ?? 'no phone'} · applied{' '}
                {lagosDate(a.created_at)}
              </p>
              <p>{a.description || 'No description.'}</p>
              <ul className="text-sm">
                <li>Category: {a.category ?? '–'}</li>
                <li>Pickup: {a.pickup_location_text || a.shop_place || '–'}</li>
                <li>
                  Delivery fee:{' '}
                  {a.delivery_fee_kobo != null ? formatNaira(a.delivery_fee_kobo) : '–'}
                </li>
                <li>
                  Set up so far: {a.items} item(s), {a.riders} rider(s)
                </li>
              </ul>
              <ActionForm
                action={approveShopAction}
                submitLabel="Approve this shop"
                pendingLabel="Approving…"
                variant="gold"
              >
                <input type="hidden" name="applicationId" value={a.id} />
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-8 text-xl font-extrabold text-navy-900">Recently approved</h2>
      {approved.length === 0 ? (
        <p className="text-muted">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {approved.slice(0, 20).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-white px-3 py-2"
            >
              <span className="font-bold">{a.business_name}</span>
              <span className="text-sm text-muted">
                {a.approved_by_name
                  ? `Approved by ${a.approved_by_name}`
                  : 'Approved by the founder'}
                {a.decided_at ? ` · ${lagosDate(a.decided_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
