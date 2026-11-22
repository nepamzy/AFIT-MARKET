import type { Metadata } from 'next'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { lagosDateTime } from '@/lib/time'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Delivery locations' }
export const dynamic = 'force-dynamic'

type Row = {
  order_id: string
  order_number?: string | null
  vendor_name?: string | null
  rider_name?: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  observed_at: string | null
  point_label: string | null
  source: string
  recorded_at: string
}

const SOURCE: Record<string, string> = {
  rider_phone: "Rider's phone",
  delivery_point: 'Approved delivery point',
  none: 'No location available',
}

export default async function DeliveryLocations() {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('admin_list_delivery_locations', { p_limit: 200 })
  const rows = (data ?? []) as Row[]
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Delivery locations' }]}
        title="Delivery locations"
        subtitle="Where each delivery ended, saved the moment the order was handed over."
      />
      {rows.length === 0 ? (
        <EmptyState title="No deliveries recorded yet">Each completed delivery will appear here.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Order</th>
                <th className="p-3">Shop / rider</th>
                <th className="p-3">Place</th>
                <th className="p-3">Source</th>
                <th className="p-3">Map</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.order_id} className="border-t border-line">
                  <td className="p-3">{lagosDateTime(r.recorded_at)}</td>
                  <td className="p-3 font-mono text-xs">{r.order_number ?? r.order_id.slice(0, 8)}</td>
                  <td className="p-3">
                    {r.vendor_name ?? '—'}
                    <br />
                    <span className="text-xs text-muted">{r.rider_name ?? ''}</span>
                  </td>
                  <td className="p-3">{r.point_label ?? '—'}</td>
                  <td className="p-3">{SOURCE[r.source] ?? r.source}</td>
                  <td className="p-3">
                    {r.lat != null && r.lng != null ? (
                      <a
                        className="font-semibold text-brand-700 underline"
                        href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open map
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
