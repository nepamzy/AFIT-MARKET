/**
 * Plain-language names and help for the settings screen. Only presentation: the database still validates every value and
 * decides which keys can be changed (`EDITABLE_SETTINGS`). A key that is not listed here is shown under "Technical settings".
 */
export type SettingKind =
  | { type: 'switch'; on: string; off: string }
  | { type: 'naira' } // stored in kobo
  | { type: 'percent' } // stored in basis points (1% = 100)
  | { type: 'number'; unit: string }
  | { type: 'choice'; options: [value: string, label: string][] }

export type SettingInfo = {
  title: string
  help: string
  kind: SettingKind
  group: 'main' | 'money' | 'orders'
}

export const SETTING_INFO: Record<string, SettingInfo> = {
  ordering_open: {
    group: 'main',
    title: 'Customers can place orders',
    help: 'Off: customers can fill a cart but cannot order, and see "waiting for approval from the AFIT board". Turn it On when the board approves. Administrator accounts can always place test orders.',
    kind: { type: 'switch', on: 'Open for orders', off: 'Closed (waiting for approval)' },
  },
  pay_on_delivery_enabled: {
    group: 'main',
    title: 'Pay when received',
    help: 'On: shops that do not sell food are paid for when the customer receives the order (food shops are always paid before). Off: everyone pays online first.',
    kind: { type: 'switch', on: 'On', off: 'Off' },
  },
  payment_split_enabled: {
    group: 'main',
    title: 'Pay shops straight through Paystack sub-accounts',
    help: 'On: each payment is split by Paystack, the shop gets its share on Paystack’s normal settlement schedule, and AFIT keeps only its commission. Turn it On only after the Paystack key is set and you have done a small real test. Off: shops are paid by transfer after the waiting time.',
    kind: { type: 'switch', on: 'On', off: 'Off' },
  },
  vendor_invite_only: {
    group: 'main',
    title: 'Shop sign-up by invitation only',
    help: 'On (beta): a shop can only sign up with a personal invitation link from Admin → Vendor invitations, and each link works once. Off: anyone can sign up as a shop.',
    kind: { type: 'switch', on: 'Invitation only', off: 'Open to everyone' },
  },
  vendor_commission_bps: {
    group: 'money',
    title: 'Commission AFIT keeps from each shop order',
    help: 'A percentage of the product value of each completed order (after any product discount). Delivery fees are not included. The rate in force when an order completes is saved with that order.',
    kind: { type: 'percent' },
  },
  commission_afit_bps: {
    group: 'money',
    title: 'Part of that commission that is AFIT’s own',
    help: 'The rest of the commission is a budget for Paystack’s costs. It cannot be more than the commission itself.',
    kind: { type: 'percent' },
  },
  delivery_fee_kobo: {
    group: 'money',
    title: 'Delivery fee',
    help: 'The flat delivery fee a customer pays for a delivery order.',
    kind: { type: 'naira' },
  },
  delivery_fee_collection_mode: {
    group: 'money',
    title: 'How the delivery fee is paid',
    help: 'Applies to new orders only; existing orders keep how they were set.',
    kind: {
      type: 'choice',
      options: [
        ['direct_to_rider', 'The customer pays the rider directly (bank transfer)'],
        ['paystack', 'It is added to the Paystack payment'],
      ],
    },
  },
  unpaid_order_expiry_minutes: {
    group: 'orders',
    title: 'Time to pay before an unpaid order is cancelled',
    help: 'How long a customer has to pay for an order that is waiting for payment.',
    kind: { type: 'number', unit: 'minutes' },
  },
  max_cart_item_quantity: {
    group: 'orders',
    title: 'Most of one item in a cart',
    help: 'The largest quantity of a single item a customer can add.',
    kind: { type: 'number', unit: 'items' },
  },
}

export const GROUP_TITLE: Record<SettingInfo['group'], { title: string; blurb: string }> = {
  main: {
    title: 'Main switches',
    blurb:
      'The three settings that decide whether and how the marketplace takes orders and pays shops.',
  },
  money: { title: 'Money', blurb: 'Commission and delivery fee.' },
  orders: { title: 'Orders', blurb: 'Limits on carts and unpaid orders.' },
}

/** How a stored value reads on the screen. */
export function showValue(key: string, value: unknown): string {
  const info = SETTING_INFO[key]
  if (!info) return JSON.stringify(value)
  const k = info.kind
  if (k.type === 'switch') return value === true ? k.on : k.off
  if (k.type === 'naira') return `₦${(Number(value) / 100).toLocaleString('en-NG')}`
  if (k.type === 'percent') return `${Number(value) / 100}%`
  if (k.type === 'number') return `${String(value)} ${k.unit}`
  if (k.type === 'choice') return k.options.find(([v]) => v === value)?.[1] ?? String(value)
  return JSON.stringify(value)
}
