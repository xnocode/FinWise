// Currency conversion helper for the agent — converts an amount stated in any
// supported currency into USD cents (transactions are always stored in USD).
// Live rates from open.er-api.com, cached for 1 hour; static fallback offline.

const CACHE_TTL = 60 * 60 * 1000
let ratesCache: { rates: Record<string, number>; fetchedAt: number } | null = null

// Approximate rates (units per 1 USD) — only used when the live API is unreachable
const STATIC_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.24, INR: 83.3,
  KRW: 1340, AUD: 1.52, CAD: 1.36, CHF: 0.88, SGD: 1.34, HKD: 7.82,
  BRL: 5.04, MXN: 17.1, RUB: 92.5, ZAR: 18.7, AED: 3.67, THB: 35.8,
  SEK: 10.6, NZD: 1.64, BDT: 110, PKR: 278, LKR: 300, EGP: 48.5,
}

async function getRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.fetchedAt < CACHE_TTL) return ratesCache.rates
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
    const data = await res.json()
    if (data?.rates) {
      ratesCache = { rates: data.rates, fetchedAt: Date.now() }
      return data.rates
    }
  } catch {
    // fall through to cache/static
  }
  if (ratesCache) return ratesCache.rates
  return STATIC_RATES
}

/**
 * Convert `amount` stated in `fromCode` (e.g. 'BDT', 'USD') to USD cents.
 * Unknown currencies fall back to treating the amount as USD.
 */
export async function convertToUsdCents(amount: number, fromCode: string): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const code = (fromCode || 'USD').toUpperCase()
  if (code === 'USD') return Math.round(amount * 100)
  const rates = await getRates()
  const rate = rates[code]
  if (!rate || rate <= 0) return Math.round(amount * 100)
  return Math.round((amount / rate) * 100)
}
