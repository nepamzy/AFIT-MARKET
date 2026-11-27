import type { Metadata } from 'next'
import { ActionForm } from '@/components/forms/action-form'
import { InviteLinkActions } from '@/components/domain/invite-links'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/fields'
import { EmptyState } from '@/components/ui/states'
import { serverEnv } from '@/lib/env'
import { lagosDate } from '@/lib/time'
import { createInvitesAction } from '@/server/modules/cofounder/portal-actions'
import { portalInvites } from '@/server/modules/cofounder/portal'

export const metadata: Metadata = { title: 'Shop invitations' }
export const dynamic = 'force-dynamic'

export default async function CofounderInvites() {
  const rows = await portalInvites()
  if (!rows)
    return (
      <EmptyState title="We could not load the invitations" icon="alert">
        Please try again.
      </EmptyState>
    )
  const site = serverEnv().SITE_URL.replace(/\/+$/, '')
  const waiting = rows.filter((r) => !r.used_at && !r.revoked_at)
  const used = rows.filter((r) => r.used_at)
  return (
    <>
      <PageHeader
        title="Shop invitations"
        subtitle="One personal link per shop. Each link works once. Send it to the shop owner, then follow the shop here until it is approved."
      />
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg font-extrabold text-navy-900">Make new links</h2>
        <ActionForm
          action={createInvitesAction}
          submitLabel="Make the links"
          pendingLabel="Making…"
          variant="gold"
        >
          <Input
            label="How many links (1 to 20)"
            name="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={1}
            required
          />
          <Input label="Shop or name for the link (optional)" name="label" maxLength={60} />
        </ActionForm>
      </Card>
      <h2 className="mb-3 text-xl font-extrabold text-navy-900">
        Waiting to be used ({waiting.length})
      </h2>
      {waiting.length === 0 ? (
        <p className="text-muted">No unused links.</p>
      ) : (
        <ul className="mb-8 space-y-3">
          {waiting.map((r) => {
            const url = `${site}/join/${r.token}`
            return (
              <li
                key={r.id}
                className="space-y-1 rounded-[var(--radius-control)] border border-line bg-white p-3"
              >
                <p className="font-bold">{r.label ?? 'Link'}</p>
                <p className="break-all font-mono text-xs">{url}</p>
                <InviteLinkActions url={url} label={r.label} />
              </li>
            )
          })}
        </ul>
      )}
      <h2 className="mb-3 text-xl font-extrabold text-navy-900">Used ({used.length})</h2>
      {used.length === 0 ? (
        <p className="text-muted">None used yet.</p>
      ) : (
        <ul className="space-y-2">
          {used.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-white px-3 py-2"
            >
              <span className="font-bold">{r.shop_name ?? r.label ?? 'Shop'}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                {r.shop_status === 'approved' ? (
                  <Badge tone="success">Approved</Badge>
                ) : r.shop_status === 'pending' ? (
                  <Badge tone="warning">Applied, waiting</Badge>
                ) : (
                  <Badge tone="neutral">Account made, no application yet</Badge>
                )}
                {r.used_at ? lagosDate(r.used_at) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
