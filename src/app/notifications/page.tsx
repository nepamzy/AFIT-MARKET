import { lagosDateTime } from '@/lib/time'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MarkReadButton } from '@/components/domain/engagement-forms'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { Pager } from '@/components/ui/pager'
import { EmptyState } from '@/components/ui/states'
import { PAGE_SIZE, listNotifications, pageParam } from '@/server/modules/engagement/queries'

export const metadata: Metadata = { title: 'Notifications' }

export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const page = pageParam((await searchParams).page)
  const data = await listNotifications(page)
  const items = data?.items ?? []
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Updates about your orders, reports and refunds."
      />
      {data && data.unread > 0 && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p>
            <Badge tone="info">{data.unread} unread</Badge>
          </p>
          <MarkReadButton />
        </Card>
      )}
      {items.length === 0 ? (
        <EmptyState title="Nothing yet">
          When something changes on one of your orders or reports, it shows up here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id}>
              <Card className="space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{n.title}</span>
                  {!n.read && <Badge tone="info">New</Badge>}
                </p>
                <p>{n.body}</p>
                <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
                  <time dateTime={n.created_at}>{lagosDateTime(n.created_at)}</time>
                  {n.link && (
                    <Link className="font-semibold text-brand-700 underline" href={n.link}>
                      Open
                    </Link>
                  )}
                </p>
                {!n.read && <MarkReadButton id={n.id} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/notifications" page={page} hasMore={items.length === PAGE_SIZE} />
    </>
  )
}
