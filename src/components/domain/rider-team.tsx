import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { removeVendorRiderAction } from '@/server/modules/vendors-and-catalogue/actions'
import type { RiderTeamMember } from '@/server/modules/vendors-and-catalogue/vendor-queries'

const ago = (s: number) =>
  s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`

/** The shop's riders: phone, whether they are on shift, and where they last were. */
export function RiderTeam({ vendorId, riders }: { vendorId: string; riders: RiderTeamMember[] }) {
  if (riders.length === 0)
    return <p className="text-muted">No riders yet. Generate a code to add your first one.</p>
  return (
    <ul className="space-y-3">
      {riders.map((r) => (
        <li key={r.id}>
          <Card className="space-y-2" data-testid="vendor-rider">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{r.name}</span>
              {r.on_shift ? <Badge tone="success">On shift</Badge> : <Badge>Off shift</Badge>}
            </p>
            {r.phone && (
              <p className="text-sm">
                <a
                  className="font-semibold text-brand-700 underline"
                  href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}
                >
                  📞 {r.phone}
                </a>
              </p>
            )}
            <p className="text-sm">
              {r.lat !== null && r.lng !== null && r.age_seconds !== null && r.on_shift ? (
                <>
                  Last seen {ago(r.age_seconds)} ·{' '}
                  <a
                    className="font-semibold text-brand-700 underline"
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                    target="_blank"
                    rel="noopener"
                  >
                    Show on the map
                  </a>
                </>
              ) : (
                <span className="text-muted">
                  Location shows while the rider is on shift and the app is open.
                </span>
              )}
            </p>
            <form action={removeVendorRiderAction}>
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="riderId" value={r.id} />
              <Button type="submit" variant="secondary">
                Remove rider
              </Button>
            </form>
          </Card>
        </li>
      ))}
    </ul>
  )
}
