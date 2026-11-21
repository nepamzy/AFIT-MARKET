import type { Metadata } from 'next'
import { SettingForm, TestEmailForm } from '@/components/domain/engagement-forms'
import { SettingEditor } from '@/components/domain/setting-editor'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { mailConfig } from '@/server/modules/engagement/mail'
import { EDITABLE_SETTINGS, listSettings } from '@/server/modules/engagement/queries'
import {
  GROUP_TITLE,
  SETTING_INFO,
  showValue,
  type SettingInfo,
} from '@/server/modules/engagement/settings-catalog'

export const metadata: Metadata = { title: 'Settings' }

export default async function Settings() {
  const rows = await listSettings()
  const mail = mailConfig()
  const editableKeys = EDITABLE_SETTINGS as readonly string[]
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const groups = (['main', 'money', 'orders'] as const).map((g) => ({
    g,
    items: Object.entries(SETTING_INFO)
      .filter(([, i]) => i.group === g)
      .flatMap(([key, info]) => {
        const row = byKey.get(key)
        return row ? [{ key, info, row }] : []
      }),
  }))
  const technical = rows.filter((r) => !(r.key in SETTING_INFO))
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Settings' }]}
        title="Settings"
        subtitle="Tap a setting to see what it does and change it. Every change is checked and recorded."
      />
      {groups.map(({ g, items }) => (
        <section key={g} className="mb-6 space-y-2" aria-labelledby={`g-${g}`}>
          <div>
            <h2 id={`g-${g}`} className="text-lg font-extrabold text-navy-900">
              {GROUP_TITLE[g].title}
            </h2>
            <p className="text-sm text-muted">{GROUP_TITLE[g].blurb}</p>
          </div>
          {items.map(({ key, info, row }) => (
            <SettingRow
              key={key}
              info={info}
              settingKey={key}
              value={row.value}
              note={row.note}
              editable={editableKeys.includes(key)}
            />
          ))}
        </section>
      ))}
      <Card className="mb-6 space-y-2" role="group" aria-label="E-mail delivery">
        <h2 className="text-lg font-bold">E-mail delivery</h2>
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={mail ? 'success' : 'danger'}>
            {mail ? 'Switched on' : 'Not switched on'}
          </Badge>
          {mail && (
            <span className="text-sm text-muted">
              Sending as {mail.fromName} &lt;{mail.from}&gt;
            </span>
          )}
        </p>
        <TestEmailForm />
      </Card>
      <details className="rounded-[var(--radius-card)] border border-line bg-card p-4">
        <summary className="cursor-pointer text-lg font-extrabold text-navy-900">
          Technical settings ({technical.length}): leave these as they are
        </summary>
        <p className="mt-2 text-sm text-muted">
          Location, arrival and timing values the system uses behind the scenes. You normally never
          need to change them.
        </p>
        <div className="mt-3 space-y-2">
          {technical.map((r) => {
            const shown = JSON.stringify(r.value)
            const editable = editableKeys.includes(r.key)
            return (
              <details
                key={r.key}
                className="rounded-[var(--radius-control)] border border-line p-3"
              >
                <summary className="cursor-pointer">
                  <span className="break-all font-mono font-bold">{r.key}</span>{' '}
                  <span className="break-all font-mono">{shown}</span>
                </summary>
                {r.note && <p className="mt-2 text-sm text-muted">{r.note}</p>}
                {editable ? (
                  <div className="mt-2">
                    <SettingForm settingKey={r.key} value={shown} />
                  </div>
                ) : (
                  <p className="mt-2">
                    <Badge>Not editable here</Badge>
                  </p>
                )}
              </details>
            )
          })}
        </div>
      </details>
    </>
  )
}

function SettingRow({
  info,
  settingKey,
  value,
  note,
  editable,
}: {
  info: SettingInfo
  settingKey: string
  value: unknown
  note: string | null
  editable: boolean
}) {
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-card p-4">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-navy-900">{info.title}</span>
        <Badge tone="brand">{showValue(settingKey, value)}</Badge>
      </summary>
      <div className="mt-3 space-y-3">
        <p>{info.help}</p>
        {note && <p className="text-xs text-muted">Note on file: {note}</p>}
        {editable ? (
          <SettingEditor settingKey={settingKey} kind={info.kind} value={value} />
        ) : (
          <Badge>Not editable here</Badge>
        )}
      </div>
    </details>
  )
}
