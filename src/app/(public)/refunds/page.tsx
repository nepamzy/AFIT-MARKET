import Link from 'next/link'
import type { Metadata } from 'next'
import { InfoPage } from '@/components/shells/info-page'

export const metadata: Metadata = { title: 'Reports and returns' }

export default function Refunds() {
  return (
    <InfoPage title="Reports and returns" intro="How a problem with an order is handled.">
      <p>
        <Link href="/legal/refunds" className="font-semibold text-brand-800 underline">
          Read the full Reports, returns and cancelled orders policy
        </Link>
      </p>
      <section>
        <h2>How to ask</h2>
        <ol>
          <li>Open the order in your account.</li>
          <li>
            Choose Report a problem, or ask for a return, and say what went wrong. Report it on the
            same day you receive your order: the window closes at midnight (Nigeria time).
          </li>
          <li>
            A person at AFIT Market reviews it. They may ask for more detail and can see the order
            history.
          </li>
        </ol>
      </section>
      <section>
        <h2>What to expect</h2>
        <ul>
          <li>
            A report does not lead to a refund. A person decides what happens next, such as
            arranging a return or taking action against the shop, rider or customer.
          </li>
          <li>
            If a shop declines your paid order or does not answer in time, your payment is returned
            automatically because you never received anything.
          </li>
          <li>Every decision and the reason are recorded.</li>
        </ul>
      </section>
    </InfoPage>
  )
}
