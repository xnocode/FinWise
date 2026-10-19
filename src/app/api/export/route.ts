// Export endpoint — generates CSV financial report
// Solves: "I need to share my financial data with an accountant or for tax purposes"
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const format = url.searchParams.get('format') || 'csv'
  const range = url.searchParams.get('range') || '12m'

  const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const now = new Date()
  const months = range === '6m' ? 6 : range === '3m' ? 3 : range === '1m' ? 1 : 12
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const txs = await db.transaction.findMany({
    where: { userId: user.id, date: { gte: startDate } },
    include: { category: true },
    orderBy: { date: 'asc' },
  })

  if (format === 'csv') {
    const headers = ['Date', 'Merchant', 'Category', 'Direction', 'Amount', 'Currency', 'Source', 'Recurring', 'Anomaly', 'Confidence']
    const rows = txs.map(t => [
      t.date.toISOString().split('T')[0],
      t.merchantRaw,
      t.category.name,
      t.direction,
      (t.amountCents / 100).toFixed(2),
      t.currency,
      t.source,
      t.recurring ? 'Yes' : 'No',
      t.anomaly ? 'Yes' : 'No',
      t.confidence.toFixed(3),
    ])
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="finwise-export-${now.toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  if (format === 'summary') {
    // Return JSON summary for printing/PDF generation
    const totalIncome = txs.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)
    const totalSpend = txs.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
    const byCategory: Record<string, { name: string; color: string; cents: number; count: number }> = {}
    for (const t of txs) {
      if (t.direction !== 'debit') continue
      if (!byCategory[t.categoryId]) {
        byCategory[t.categoryId] = { name: t.category.name, color: t.category.color, cents: 0, count: 0 }
      }
      byCategory[t.categoryId].cents += t.amountCents
      byCategory[t.categoryId].count += 1
    }
    const byMonth: Record<string, { income: number; spend: number }> = {}
    for (const t of txs) {
      const m = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[m]) byMonth[m] = { income: 0, spend: 0 }
      if (t.direction === 'credit') byMonth[m].income += t.amountCents
      else byMonth[m].spend += t.amountCents
    }
    return NextResponse.json({
      ok: true,
      generatedAt: now.toISOString(),
      range: { months, start: startDate.toISOString().split('T')[0], end: now.toISOString().split('T')[0] },
      user: { email: user.email, name: user.name },
      totals: {
        transactions: txs.length,
        incomeCents: totalIncome,
        spendCents: totalSpend,
        netCents: totalIncome - totalSpend,
        savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalSpend) / totalIncome) * 100) : 0,
      },
      byCategory: Object.values(byCategory).sort((a, b) => b.cents - a.cents),
      byMonth: Object.entries(byMonth).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
      anomalies: txs.filter(t => t.anomaly).length,
      recurring: txs.filter(t => t.recurring).length,
    })
  }

  return NextResponse.json({ ok: false, error: 'Unknown format' }, { status: 400 })
}
