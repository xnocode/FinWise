'use client'

// ─── Global currency state (set by Home component on load) ───────────────
let _currencyConfig: CurrencyConfig | null = null

export function setGlobalCurrency(config: CurrencyConfig | null) {
  _currencyConfig = config
}

export function getGlobalCurrency(): CurrencyConfig | null {
  return _currencyConfig
}

// Helper: format cents as dollars — auto-uses global currency config if set
export function fmt(cents: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (cents == null || typeof cents !== 'number' || isNaN(cents)) return formatStr(0, opts)
  // If a currency config is set, use it for live conversion
  if (_currencyConfig && _currencyConfig.currency !== 'USD') {
    return fmtCurrency(cents, _currencyConfig, opts)
  }
  // Default USD formatting
  return formatStr(cents, opts)
}

function formatStr(cents: number, opts: { sign?: boolean; compact?: boolean }): string {
  const sign = opts.sign && cents > 0 ? '+' : cents < 0 ? '-' : ''
  const abs = Math.abs(cents) / 100
  if (opts.compact && abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`
  }
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Multi-currency formatting ───────────────────────────────────────────

export type CurrencyMeta = {
  symbol: string
  name: string
  position: 'before' | 'after'
  decimals: number
}

export type CurrencyConfig = {
  currency: string      // e.g. 'EUR', 'JPY'
  rate: number          // exchange rate from USD to target
  meta: CurrencyMeta
}

// Format cents (stored as USD) into the target currency
export function fmtCurrency(
  cents: number,
  config: CurrencyConfig | null,
  opts: { sign?: boolean; compact?: boolean } = {}
): string {
  if (cents == null || typeof cents !== 'number' || isNaN(cents)) {
    return formatAmount(0, config, opts)
  }
  return formatAmount(cents, config, opts)
}

function formatAmount(cents: number, config: CurrencyConfig | null, opts: { sign?: boolean; compact?: boolean }): string {
  if (!config) {
    // Fallback to USD formatting
    return fmt(cents, opts)
  }

  const usdAmount = cents / 100
  const converted = usdAmount * config.rate
  const sign = opts.sign && cents > 0 ? '+' : cents < 0 ? '-' : ''
  const abs = Math.abs(converted)

  const { symbol, position, decimals } = config.meta

  if (opts.compact && abs >= 1000) {
    const compactStr = abs >= 1000000
      ? `${(abs / 1000000).toFixed(1)}M`
      : `${(abs / 1000).toFixed(1)}k`
    if (position === 'before') {
      return `${sign}${symbol}${compactStr}`
    }
    return `${sign}${compactStr}${symbol}`
  }

  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  if (position === 'before') {
    return `${sign}${symbol}${formatted}`
  }
  return `${sign}${formatted} ${symbol}`
}

// Get the currency symbol for display
export function getCurrencySymbol(config: CurrencyConfig | null): string {
  if (!config) return '$'
  return config.meta.symbol
}

export function fmtMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-')
  const d = new Date(parseInt(y), parseInt(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
