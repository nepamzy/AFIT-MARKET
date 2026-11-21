import type { Metadata } from 'next'
import { ActionForm } from '@/components/forms/action-form'
import { CopyAllLinks, InviteLinkActions } from '@/components/domain/invite-links'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/fields'
import { EmptyState } from '@/components/ui/states'
import { serverEnv } from '@/lib/env'
import { lagosDate } from '@/lib/time'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  createVendorInvitesAction,
  revokeVendorInviteAction,
} from '@/server/modules/vendor-invites/actions'
import type { InviteRow } from '@/server/modules/vendor-invites/invites'

export const metadata: Metadata = { title: 'Vendor invitations' }
export const dynamic = 'force-dynamic'

export default async function Invites() {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('admin_list_vendor_invites')
  const rows = (data ?? []) as InviteRow[]
  const site = serverEnv().SITE_URL.replace(/\/+$/, '')
  const link = (t: string) => `${site}/join/${t}`
  const unused = rows.filter((r) => !r.used_at && !r.revoked_at)
  const used = rows.filter((r) => r.used_at)
  const allText = unused
    .map((r) => `${r.label ?? ''}${r.label ? ': ' : ''}${link(r.token)}`)
    .join('\n')
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Vendor invitations' }]}
        title="Vendor invitations"
        subtitle="One personal link per shop. Each link works once, then it is used up."
      />
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg font-extrabold text-navy-900">Make new invitation links</h2>
        <ActionForm
          action={createVendorInvitesAction}
          submitLabel="Make the links"
          pendingLabel="Making…"
          variant="gold"
        >
          <Input
            label="How many links (1 to 200)"
            name="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            defaultValue={10}
            required
          />
          <Input
            label="Name for the batch (optional, for example Beta wave 1)"
            name="label"
            maxLength={60}
          />
        </ActionForm>
        <p className="text-sm text-muted">
          Send each link to one shop only. When that shop creates its account with the link, the
          link is used up and cannot register anyone else.
        </p>
      </Card>
      <p className="mb-3 flex flex-wrap gap-2">
        <Badge tone="brand">{rows.length} made</Badge>
        <Badge tone="success">{used.length} used</Badge>
        <Badge>{unused.length} waiting</Badge>
      </p>
      {unused.length > 0 && (
        <Card className="mb-6 space-y-2">
          <h2 className="text-lg font-extrabold text-navy-900">All waiting links</h2>
          <CopyAllLinks text={allText} />
        </Card>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No invitation links yet">Make your first batch above.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const state = r.used_at ? 'used' : r.revoked_at ? 'cancelled' : 'waiting'
            return (
              <li key={r.id}>
                <Card className="space-y-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-navy-900">{r.label ?? 'No name'}</span>
                    <Badge
                      tone={
                        state === 'used' ? 'success' : state === 'cancelled' ? 'danger' : 'brand'
                      }
                    >
                      {state === 'used' ? 'Used' : state === 'cancelled' ? 'Cancelled' : 'Waiting'}
                    </Badge>
                    <span className="text-sm text-muted">Made {lagosDate(r.created_at)}</span>
                  </p>
                  {state === 'used' && (
                    <p className="text-sm">
                      Used by <strong>{r.used_by_name ?? 'a new shop'}</strong> on{' '}
                      {lagosDate(r.used_at ?? r.created_at)}
                    </p>
                  )}
                  {state === 'waiting' && (
                    <>
                      <p className="break-all font-mono text-xs text-muted">{link(r.token)}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <InviteLinkActions url={link(r.token)} label={r.label} />
                        <form action={revokeVendorInviteAction}>
                          <input type="hidden" name="inviteId" value={r.id} />
                          <Button type="submit" variant="danger">
                            Cancel this link
                          </Button>
                        </form>
                      </div>
                    </>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
