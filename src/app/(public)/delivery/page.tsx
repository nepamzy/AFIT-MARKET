import type { Metadata } from 'next'
import { InfoPage } from '@/components/shells/info-page'

export const metadata: Metadata = { title: 'Delivery' }

export default function Delivery() {
  return (
    <InfoPage title="Delivery" intro="How pickup and delivery work.">
      <section>
        <h2>Pickup</h2>
        <p>
          When your order is ready you get a one-time pickup code on the order page. Show it at the
          shop. The shop checks the code before handing over your order.
        </p>
      </section>
      <section>
        <h2>Delivery</h2>
        <ul>
          <li>Delivery goes to an approved delivery point, chosen at checkout.</li>
          <li>
            An approved rider accepts the order, collects it from the shop and completes the
            delivery.
          </li>
          <li>
            You can follow the status on your order page. When the rider arrives, the delivery is
            confirmed by scanning a QR code: the rider shows one and you scan it, or you show one
            and the rider scans it.
          </li>
        </ul>
      </section>
      <section>
        <h2>Delivery fee</h2>
        <p>
          The delivery fee is shown at checkout and added to your total, so you pay it together with
          your items in one Paystack payment. There is nothing to pay the rider afterwards: the shop
          pays its own rider.
        </p>
      </section>
    </InfoPage>
  )
}
