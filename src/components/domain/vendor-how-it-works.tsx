import { Card } from '@/components/ui/card'

/** What a shop should know before it makes its account: what AFIT Market keeps, how the money and the work go, and riders. */
export function VendorHowItWorks({ commissionPercent = 5 }: { commissionPercent?: number }) {
  return (
    <Card className="max-w-2xl space-y-4" data-testid="vendor-how-it-works">
      <h2 className="text-xl font-extrabold text-navy-900">How AFIT Market works for your shop</h2>

      <section className="space-y-1">
        <h3 className="font-bold text-navy-900">What we take</h3>
        <p>
          AFIT Market keeps <strong>{commissionPercent}%</strong> of each completed order. That is{' '}
          {commissionPercent}% of the order total: your items and the delivery fee when the customer
          chose delivery. The rate is the same for pickup and delivery. Customers pay no platform
          fee, only Paystack&apos;s own small charge. You keep the rest. If a delivery fee is part
          of the order, you pay your own rider from your share. The rate is saved with each order,
          so it never changes for an order already placed.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-bold text-navy-900">How it goes, step by step</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create your shop account with your invitation link.</li>
          <li>Send your shop details. We check them and give you final approval.</li>
          <li>
            <strong>Add your account details for payout.</strong> This is essential: it is where
            your money is paid. You can change it later.
          </li>
          <li>Build your menu with photos and prices.</li>
          <li>
            Customers order and pay. You have 15 hours to <strong>accept or decline</strong> each
            order, then you prepare it and mark it ready.
          </li>
          <li>
            Pickup: the customer scans your QR code, or you scan theirs. Delivery: your rider takes
            it and the customer confirms with a QR code and signature. The order is complete only
            when the customer has it.
          </li>
          <li>
            Your money is paid to your payout account after the order is completed, unless a
            customer has reported a problem with it. Then it waits until that is settled.
          </li>
        </ol>
      </section>

      <section className="space-y-1">
        <h3 className="font-bold text-navy-900">Your own riders: how to get and add one</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            The person you want as a rider first creates a rider account on AFIT Market and is
            approved.
          </li>
          <li>
            In your shop area, open <strong>Riders</strong> and tap to make a 6-digit code for that
            person. The code works <strong>once</strong> and lasts <strong>10 minutes</strong>.
          </li>
          <li>
            They enter the code in their rider area (&quot;Join a shop&quot;). They are then your
            rider, and they see and take only your shop&apos;s orders.
          </li>
          <li>
            For each delivery order you can choose which of your riders takes it, or leave it open
            for any of them. You can remove a rider at any time.
          </li>
        </ol>
        <p className="text-sm text-muted">
          A shop must have at least one rider before customers can choose delivery. Until then,
          customers can only pick up.
        </p>
      </section>
    </Card>
  )
}
