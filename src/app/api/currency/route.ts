// Currency endpoint — fetches live exchange rates and converts amounts
// Uses open.er-api.com (free, no API key required)
// Caches rates for 1 hour to avoid rate limiting
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// In-memory cache for exchange rates (1 hour TTL)
let ratesCache: { rates: Record<string, number>; fetchedAt: number; base: string } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Currency metadata (symbol, name, position)
export const CURRENCY_META: Record<string, { symbol: string; name: string; position: 'before' | 'after'; decimals: number }> = {
  USD: { symbol: '$', name: 'US Dollar', position: 'before', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', position: 'before', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', position: 'before', decimals: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', position: 'before', decimals: 0 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', position: 'before', decimals: 2 },
  INR: { symbol: '₹', name: 'Indian Rupee', position: 'before', decimals: 2 },
  KRW: { symbol: '₩', name: 'Korean Won', position: 'before', decimals: 0 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', position: 'before', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', position: 'before', decimals: 2 },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', position: 'before', decimals: 2 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', position: 'before', decimals: 2 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', position: 'before', decimals: 2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real', position: 'before', decimals: 2 },
  MXN: { symbol: '$', name: 'Mexican Peso', position: 'before', decimals: 2 },
  RUB: { symbol: '₽', name: 'Russian Ruble', position: 'after', decimals: 2 },
  ZAR: { symbol: 'R', name: 'South African Rand', position: 'before', decimals: 2 },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', position: 'after', decimals: 2 },
  THB: { symbol: '฿', name: 'Thai Baht', position: 'before', decimals: 2 },
  SEK: { symbol: 'kr', name: 'Swedish Krona', position: 'after', decimals: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', position: 'before', decimals: 2 },
}

async function fetchLiveRates(): Promise<Record<string, number>> {
  // Check cache first
  if (ratesCache && Date.now() - ratesCache.fetchedAt < CACHE_TTL) {
    return ratesCache.rates
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'Accept': 'application/json' },
      // @ts-ignore — Next.js fetch cache options
      next: { revalidate: 3600 },
    })
    const data = await res.json()
    if (data.rates) {
      ratesCache = {
        rates: data.rates,
        fetchedAt: Date.now(),
        base: 'USD',
      }
      return data.rates
    }
  } catch (err) {
    console.error('Failed to fetch live rates:', err)
    // Fallback to static rates if API fails
    if (ratesCache) return ratesCache.rates
  }

  // Fallback static rates (approximate, as of 2024)
  return {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.24, INR: 83.3,
    KRW: 1340, AUD: 1.52, CAD: 1.36, CHF: 0.88, SGD: 1.34, HKD: 7.82,
    BRL: 5.04, MXN: 17.1, RUB: 92.5, ZAR: 18.7, AED: 3.67, THB: 35.8,
    SEK: 10.6, NZD: 1.64,
  }
}

export async function GET() {
  try {
    // Get user's selected currency
    const user = await db.user.findUnique({
      where: { email: 'demo@example.com' },
      include: { settings: true },
    })

    let targetCurrency = 'USD'
    if (user?.settings?.currency) {
      targetCurrency = user.settings.currency
    }

    const rates = await fetchLiveRates()
    const rate = rates[targetCurrency] || 1
    const meta = CURRENCY_META[targetCurrency] || CURRENCY_META.USD

    return NextResponse.json({
      ok: true,
      base: 'USD',
      target: targetCurrency,
      rate,
      rates,
      meta,
      fetchedAt: ratesCache?.fetchedAt || Date.now(),
      cached: ratesCache !== null && Date.now() - ratesCache.fetchedAt < CACHE_TTL,
      supportedCurrencies: Object.entries(CURRENCY_META).map(([code, m]) => ({
        code, symbol: m.symbol, name: m.name, rate: rates[code] || null,
      })),
    })
  } catch (err: any) {
    console.error('Currency API error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
