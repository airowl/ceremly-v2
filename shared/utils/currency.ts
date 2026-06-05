/**
 * Currency utilities
 * USD-only formatting for consistent price display
 */

/** Format an amount in cents to a USD currency string */
export function formatCurrencyAmount(amountInCents: number): string {
  const amount = amountInCents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount)
}
