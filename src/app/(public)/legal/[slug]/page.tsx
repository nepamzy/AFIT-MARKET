import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarkdownLite } from '@/components/domain/markdown-lite'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { LEGAL_PUBLIC } from '@/content/legal-public.generated'

export function generateStaticParams() {
  return LEGAL_PUBLIC.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = LEGAL_PUBLIC.find((d) => d.slug === slug)
  return { title: doc?.title ?? 'Legal' }
}

export default async function LegalDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = LEGAL_PUBLIC.find((d) => d.slug === slug)
  if (!doc) notFound()
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Legal', href: '/legal' },
          { label: doc.title },
        ]}
      />
      <article className="mt-4">
        <MarkdownLite source={doc.markdown} />
      </article>
      <p className="mt-8 text-sm text-muted">
        <Link href="/legal" className="underline">
          All legal documents
        </Link>
      </p>
    </div>
  )
}
