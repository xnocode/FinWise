// Insights endpoint — anomalies + month-over-month deltas + peer-style aggregates
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserEmail } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await db.user.findUnique({ where: { email: getUserEmail(req) } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  const [thisMonthTx, lastMonthTx, anomalies, allTx] = await Promise.all([
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: thisMonthStart } },
      include: { category: true },
    }),
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: lastMonthStart, lte: lastMonthEnd } },
      include: { category: true },
    }),
    db.transaction.findMany({
      where: { userId: user.id, anomaly: true },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: threeMonthsAgo } },
      include: { category: true },
    }),
  ])

  const sumByCat = (txs: any[]) => {
    const m: Record<string, { name: string; color: string; cents: number; count: number }> = {}
    for (const t of txs) {
      if (t.direction !== 'debit') continue
      if (!m[t.categoryId]) m[t.categoryId] = { name: t.category.name, color: t.category.color, cents: 0, count: 0 }
      m[t.categoryId].cents += t.amountCents
      m[t.categoryId].count += 1
    }
    return m
  }
  const thisM = sumByCat(thisMonthTx)
  const lastM = sumByCat(lastMonthTx)
  const cats = new Set([...Object.keys(thisM), ...Object.keys(lastM)])
  const momDeltas = Array.from(cats).map(catId => {
    const t = thisM[catId]?.cents || 0
    const l = lastM[catId]?.cents || 0
    const pct = l > 0 ? Math.round(((t - l) / l) * 100) : (t > 0 ? 100 : 0)
    return {
      category: thisM[catId]?.name || lastM[catId]?.name,
      color: thisM[catId]?.color || lastM[catId]?.color,
      thisMonthCents: t,
      lastMonthCents: l,
      percentChange: pct,
      trend: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat',
    }
  }).sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))

  // Top merchants by spend (3 months)
  const merchantMap: Record<string, { merchant: string; category: string; color: string; cents: number; count: number }> = {}
  for (const t of allTx) {
    if (t.direction !== 'debit') continue
    const key = t.merchantNorm
    if (!merchantMap[key]) {
      merchantMap[key] = {
        merchant: t.merchantRaw,
        category: t.category.name,
        color: t.category.color,
        cents: 0,
        count: 0,
      }
    }
    merchantMap[key].cents += t.amountCents
    merchantMap[key].count += 1
  }
  const topMerchants = Object.values(merchantMap)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8)

  // Recurring subscriptions detected (transactions that repeat across >= 2 months with same merchant + similar amount)
  const recurringMap: Record<string, { merchant: string; category: string; color: string; cents: number; monthsActive: number; lastDate: string }> = {}
  for (const t of allTx) {
    if (!t.recurring) continue
    const key = t.merchantNorm
    if (!recurringMap[key]) {
      recurringMap[key] = {
        merchant: t.merchantRaw,
        category: t.category.name,
        color: t.category.color,
        cents: 0,
        monthsActive: 0,
        lastDate: t.date.toISOString(),
      }
    }
    recurringMap[key].cents += t.amountCents
    recurringMap[key].monthsActive += 1
    if (t.date.toISOString() > recurringMap[key].lastDate) {
      recurringMap[key].lastDate = t.date.toISOString()
    }
  }
  const recurringSubscriptions = Object.values(recurringMap)
    .map(r => ({ ...r, monthlyAverageCents: Math.round(r.cents / Math.max(1, r.monthsActive)) }))
    .sort((a, b) => b.cents - a.cents)

  return NextResponse.json({
    ok: true,
    monthOverMonth: momDeltas,
    anomalies: anomalies.map(a => ({
      id: a.id,
      date: a.date,
      merchant: a.merchantRaw,
      amountCents: a.amountCents,
      category: a.category.name,
      color: a.category.color,
      score: a.anomalyScore,
    })),
    topMerchants,
    recurringSubscriptions,
  })
}
