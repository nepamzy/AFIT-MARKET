import Link from 'next/link'
import type { Metadata } from 'next'
import { InfoPage } from '@/components/shells/info-page'

export const metadata: Metadata = { title: 'Payments' }

export default function Payments() {
  return (
    <InfoPage title="Payments" intro="How you pay and what you see.">
      <p>
        <Link href="/legal/payments" className="font-semibold text-brand-800 underline">
          Read the full Payments, delivery fee and payouts
        </Link>
      </p>
      <section>
        <h2>How you pay</h2>
        <p>
          Payment is online through Paystack (cards and bank transfer, as Paystack offers them). The
          total is calculated by the server from current prices and is shown before you pay.
        </p>
      </section>
      <section>
        <h2>When the shop is paid</h2>
        <p>
          Your payment is held safely. The shop is paid automatically when the day your order is
          completed ends (midnight, Nigeria time). Until then you can report a problem from your
          order page and ask for your money back, so report it on the same day you receive your
          order. A complaint that is still open holds the shop&apos;s payment until it is settled.
        </p>
      </section>
      <section>
        <h2>Receipts and fees</h2>
        <ul>
          <li>
            Your order page shows what you paid, and receipts are available for delivery fee
            payments.
          </li>
          <li>
            Customers pay no platform fee. Shops pay a 4.5% commission on the product subtotal after
            discounts, not on delivery.
          </li>
          <li>We never show or store your card details; Paystack handles them.</li>
        </ul>
      </section>
    </InfoPage>
  )
}
