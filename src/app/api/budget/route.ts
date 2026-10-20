// Budget endpoint — get current month + update envelope
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [budgets, txs] = await Promise.all([
    db.budget.findMany({ where: { userId: user.id, month }, include: { category: true } }),
    db.transaction.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
    }),
  ])

  const spendByCat: Record<string, number> = {}
  for (const t of txs) {
    if (t.direction === 'debit') {
      spendByCat[t.categoryId] = (spendByCat[t.categoryId] || 0) + t.amountCents
    }
  }

  const budgetSummary = budgets.map(b => ({
    id: b.id,
    categoryId: b.categoryId,
    category: b.category.name,
    color: b.category.color,
    budgetCents: b.amountCents,
    spentCents: spendByCat[b.categoryId] || 0,
    remainingCents: b.amountCents - (spendByCat[b.categoryId] || 0),
    percentUsed: Math.round(((spendByCat[b.categoryId] || 0) / b.amountCents) * 100),
  }))

  const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0)
  const totalSpent = budgetSummary.reduce((s, b) => s + b.spentCents, 0)

  return NextResponse.json({
    ok: true,
    month,
    budgets: budgetSummary,
    totalBudgetCents: totalBudget,
    totalSpentCents: totalSpent,
    totalRemainingCents: totalBudget - totalSpent,
    percentUsed: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { categoryId, amountCents } = body
    if (!categoryId || typeof amountCents !== 'number') {
      return NextResponse.json({ ok: false, error: 'categoryId and amountCents required' }, { status: 400 })
    }
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    if (user.tier === 'Viewer') {
      return NextResponse.json({ ok: false, error: 'Viewer tier cannot modify budgets' }, { status: 403 })
    }

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budget = await db.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId, month } },
      update: { amountCents },
      create: { userId: user.id, categoryId, month, amountCents },
    })

    return NextResponse.json({ ok: true, budget })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
