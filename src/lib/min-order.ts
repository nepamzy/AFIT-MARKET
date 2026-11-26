/** The smallest checkout we take, in kobo (₦150). Nothing is said about why: the customer is only told the minimum. */
export const MIN_CHECKOUT_KOBO = 15_000

export const MIN_ORDER_MESSAGE =
  'The smallest order we can take is ₦150. Please add something more to your cart.'

export const belowMinimum = (kobo: number | bigint) => Number(kobo) < MIN_CHECKOUT_KOBO
