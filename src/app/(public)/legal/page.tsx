import type { Metadata } from 'next'
import Link from 'next/link'
import { InfoPage } from '@/components/shells/info-page'
import { LEGAL_PUBLIC } from '@/content/legal-public.generated'

export const metadata: Metadata = { title: 'Legal' }

export default function LegalIndex() {
  return (
    <InfoPage title="Legal" intro="The terms and policies that apply when you use AFIT Market.">
      <ul className="not-prose space-y-2">
        {LEGAL_PUBLIC.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="font-semibold text-brand-800 underline">
              {d.title}
            </Link>
            <span className="text-sm text-muted"> · {d.updated}</span>
          </li>
        ))}
      </ul>
    </InfoPage>
  )
}
