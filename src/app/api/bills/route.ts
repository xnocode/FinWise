// Bills endpoint — upcoming bill reminders + scheduling
// Solves: "what bills are due soon and can I cover them?"
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

  const now = new Date()

  // Find recurring transactions (subscriptions, rent, utilities)
  const recurring = await db.transaction.findMany({
    where: { userId: user.id, recurring: true, direction: 'debit' },
    include: { category: true },
    orderBy: { date: 'desc' },
  })

  // Group by merchant + amount to identify distinct bills
  const billMap: Record<string, {
    merchant: string
    merchantNorm: string
    category: string
    color: string
    typicalAmountCents: number
    history: { date: string; amountCents: number }[]
    lastPaid: string
    expectedNext: string
    daysUntilDue: number
    frequency: 'monthly' | 'weekly' | 'irregular'
  }> = {}

  for (const t of recurring) {
    const key = t.merchantNorm
    if (!billMap[key]) {
      billMap[key] = {
        merchant: t.merchantRaw,
        merchantNorm: t.merchantNorm,
        category: t.category.name,
        color: t.category.color,
        typicalAmountCents: 0,
        history: [],
        lastPaid: t.date.toISOString(),
        expectedNext: '',
        daysUntilDue: 0,
        frequency: 'monthly',
      }
    }
    billMap[key].history.push({ date: t.date.toISOString(), amountCents: t.amountCents })
    if (t.date.toISOString() > billMap[key].lastPaid) {
      billMap[key].lastPaid = t.date.toISOString()
    }
  }

  // Calculate typical amount + expected next date
  const bills = Object.values(billMap).map(b => {
    const amounts = b.history.map(h => h.amountCents)
    b.typicalAmountCents = Math.round(amounts.reduce((s, x) => s + x, 0) / amounts.length)

    // Predict next due date = last paid + ~30 days
    const lastPaidDate = new Date(b.lastPaid)
    const expectedNext = new Date(lastPaidDate)
    expectedNext.setDate(expectedNext.getDate() + 30)
    b.expectedNext = expectedNext.toISOString().split('T')[0]
    b.daysUntilDue = Math.ceil((expectedNext.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Detect frequency
    if (b.history.length >= 2) {
      const dates = b.history.map(h => new Date(h.date).getTime()).sort()
      const intervals: number[] = []
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
      }
      const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length
      b.frequency = avgInterval < 10 ? 'weekly' : avgInterval < 35 ? 'monthly' : 'irregular'
    }

    return b
  }).sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  // Categorize by urgency
  const overdue = bills.filter(b => b.daysUntilDue < 0)
  const dueSoon = bills.filter(b => b.daysUntilDue >= 0 && b.daysUntilDue <= 7)
  const dueLater = bills.filter(b => b.daysUntilDue > 7 && b.daysUntilDue <= 30)
  const farOut = bills.filter(b => b.daysUntilDue > 30)

  // Next 30 days projected bill total
  const next30DaysTotal = bills
    .filter(b => b.daysUntilDue <= 30 && b.daysUntilDue >= 0)
    .reduce((s, b) => s + b.typicalAmountCents, 0)

  // Coverage check — can user pay these bills?
  const thisMonthIncome = await db.transaction.aggregate({
    where: {
      userId: user.id,
      direction: 'credit',
      date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    },
    _sum: { amountCents: true },
  })
  const thisMonthSpend = await db.transaction.aggregate({
    where: {
      userId: user.id,
      direction: 'debit',
      date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    },
    _sum: { amountCents: true },
  })
  const availableCash = (thisMonthIncome._sum.amountCents || 0) - (thisMonthSpend._sum.amountCents || 0)
  const coverageRatio = next30DaysTotal > 0 ? availableCash / next30DaysTotal : 0
  const canCover = availableCash >= next30DaysTotal

  return NextResponse.json({
    ok: true,
    bills,
    summary: {
      total: bills.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      dueLater: dueLater.length,
      next30DaysTotalCents: next30DaysTotal,
      availableCashCents: availableCash,
      coverageRatio: Math.round(coverageRatio * 100),
      canCover,
      status: canCover ? 'covered' : coverageRatio > 0.5 ? 'tight' : 'shortfall',
    },
    groups: {
      overdue,
      dueSoon,
      dueLater,
      farOut,
    },
  })
}
