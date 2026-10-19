'use client'

// Helper: format cents as dollars
export function fmt(cents: number | null | undefined, opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (cents == null || typeof cents !== 'number' || isNaN(cents)) return '$0.00'
  const sign = opts.sign && cents > 0 ? '+' : cents < 0 ? '-' : ''
  const abs = Math.abs(cents) / 100
  if (opts.compact && abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`
  }
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-')
  const d = new Date(parseInt(y), parseInt(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
