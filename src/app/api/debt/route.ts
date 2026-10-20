// Debt Payoff Planner — Real user debts with Avalanche vs Snowball payoff strategies
// Handles CRUD on debts stored in database + real payoff simulation
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type DebtItem = {
  id: string
  name: string
  balanceCents: number
  apr: number           // annual percentage rate (0.20 = 20%)
  minPaymentCents: number
  category: string
}

// Simulate payoff strategy month by month
function simulatePayoff(debts: DebtItem[], extraPaymentCents: number, strategy: 'avalanche' | 'snowball') {
  if (debts.length === 0) {
    return {
      monthsToPayoff: 0,
      yearsToPayoff: 0,
      totalInterestPaid: 0,
      totalPaid: 0,
      monthlyHistory: [],
      payoffDate: new Date().toISOString().split('T')[0],
    }
  }

  let workingDebts = debts.map(d => ({ ...d }))
  const totalMinPayment = workingDebts.reduce((s, d) => s + d.minPaymentCents, 0)
  const totalMonthly = totalMinPayment + extraPaymentCents
  const monthlyHistory: { month: number; totalBalance: number; totalInterestPaid: number; debts: { name: string; balance: number }[] }[] = [{
    month: 0,
    totalBalance: workingDebts.reduce((s, d) => s + d.balanceCents, 0),
    totalInterestPaid: 0,
    debts: workingDebts.map(d => ({ name: d.name, balance: d.balanceCents })),
  }]

  let totalInterestPaid = 0
  let month = 0
  const MAX_MONTHS = 600  // 50 year cap

  while (workingDebts.some(d => d.balanceCents > 0) && month < MAX_MONTHS) {
    month++
    // 1. Accrue interest
    for (const d of workingDebts) {
      if (d.balanceCents > 0) {
        const interest = Math.round(d.balanceCents * (d.apr / 12))
        d.balanceCents += interest
        totalInterestPaid += interest
      }
    }
    // 2. Sort by strategy
    if (strategy === 'avalanche') {
      workingDebts.sort((a, b) => b.apr - a.apr)  // highest APR first
    } else {
      workingDebts.sort((a, b) => a.balanceCents - b.balanceCents)  // smallest balance first
    }
    // 3. Pay minimums first, then apply extra to the target debt
    let remaining = totalMonthly
    for (const d of workingDebts) {
      if (d.balanceCents <= 0) continue
      const payment = Math.min(d.minPaymentCents, d.balanceCents, remaining)
      d.balanceCents -= payment
      remaining -= payment
    }
    // 4. Apply extra payment to target (first non-zero balance after sort)
    for (const d of workingDebts) {
      if (d.balanceCents <= 0) continue
      const extra = Math.min(d.balanceCents, remaining)
      d.balanceCents -= extra
      remaining -= extra
      if (remaining <= 0) break
    }
    // 5. Record history
    monthlyHistory.push({
      month,
      totalBalance: workingDebts.reduce((s, d) => s + Math.max(0, d.balanceCents), 0),
      totalInterestPaid,
      debts: workingDebts.map(d => ({ name: d.name, balance: Math.max(0, d.balanceCents) })),
    })
  }

  return {
    monthsToPayoff: month,
    yearsToPayoff: Math.round((month / 12) * 10) / 10,
    totalInterestPaid,
    totalPaid: debts.reduce((s, d) => s + d.balanceCents, 0) + totalInterestPaid,
    monthlyHistory: monthlyHistory.filter((_, i) => i % 3 === 0 || i === monthlyHistory.length - 1),
    payoffDate: new Date(new Date().getFullYear(), new Date().getMonth() + month, 1).toISOString().split('T')[0],
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

  // Retrieve user's actual debts from database
  const debts = await db.debt.findMany({
    where: { userId: user.id },
    orderBy: { balanceCents: 'desc' },
  })

  const extraPayment = 20000  // $200/mo extra
  const debtItems: DebtItem[] = debts.map(d => ({
    id: d.id,
    name: d.name,
    balanceCents: d.balanceCents,
    apr: d.apr,
    minPaymentCents: d.minPaymentCents,
    category: d.category,
  }))

  const avalanche = simulatePayoff(debtItems, extraPayment, 'avalanche')
  const snowball = simulatePayoff(debtItems, extraPayment, 'snowball')

  const interestSavingsAvalanche = snowball.totalInterestPaid - avalanche.totalInterestPaid
  const recommended = interestSavingsAvalanche > 0 ? 'avalanche' : 'snowball'

  const avalancheOrder = [...debtItems].sort((a, b) => b.apr - a.apr).map((d, i) => ({
    rank: i + 1, name: d.name, balanceCents: d.balanceCents, apr: d.apr, monthlyInterestCents: Math.round(d.balanceCents * d.apr / 12),
  }))
  const snowballOrder = [...debtItems].sort((a, b) => a.balanceCents - b.balanceCents).map((d, i) => ({
    rank: i + 1, name: d.name, balanceCents: d.balanceCents, apr: d.apr, monthlyInterestCents: Math.round(d.balanceCents * d.apr / 12),
  }))

  return NextResponse.json({
    ok: true,
    debts: debtItems.map(d => ({
      ...d,
      monthlyInterestCents: Math.round(d.balanceCents * d.apr / 12),
      payoffMonthsAtMinOnly: d.minPaymentCents > 0 ? Math.ceil(d.balanceCents / d.minPaymentCents) : 0,
    })),
    totalDebtCents: debtItems.reduce((s, d) => s + d.balanceCents, 0),
    totalMinPaymentCents: debtItems.reduce((s, d) => s + d.minPaymentCents, 0),
    extraPaymentCents: extraPayment,
    avalanche,
    snowball,
    comparison: {
      recommended,
      interestSavingsCents: Math.abs(interestSavingsAvalanche),
      timeSavingsMonths: Math.abs(snowball.monthsToPayoff - avalanche.monthsToPayoff),
      reasoning: recommended === 'avalanche'
        ? 'Avalanche (highest APR first) saves you more money on interest.'
        : 'Snowball (smallest balance first) provides faster motivation with quick payoffs.',
    },
    avalancheOrder,
    snowballOrder,
  })
}

// Add a new debt
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await req.json()
    const { name, category, balanceCents, apr, minPaymentCents } = body

    if (!name || !balanceCents) {
      return NextResponse.json({ ok: false, error: 'Debt name and balance are required' }, { status: 400 })
    }

    const debt = await db.debt.create({
      data: {
        userId: user.id,
        name: name.trim(),
        category: category || 'Credit Card',
        balanceCents: Math.round(Number(balanceCents)),
        apr: apr ? Number(apr) : 0.18,
        minPaymentCents: minPaymentCents ? Math.round(Number(minPaymentCents)) : Math.round(Number(balanceCents) * 0.03),
      },
    })

    return NextResponse.json({ ok: true, debt })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// Update an existing debt
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await req.json()
    const { id, name, category, balanceCents, apr, minPaymentCents } = body

    if (!id) return NextResponse.json({ ok: false, error: 'Debt ID required' }, { status: 400 })

    const existing = await db.debt.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Debt not found' }, { status: 404 })
    const updated = await db.debt.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(category ? { category } : {}),
        ...(balanceCents !== undefined ? { balanceCents: Math.round(Number(balanceCents)) } : {}),
        ...(apr !== undefined ? { apr: Number(apr) } : {}),
        ...(minPaymentCents !== undefined ? { minPaymentCents: Math.round(Number(minPaymentCents)) } : {}),
      },
    })

    return NextResponse.json({ ok: true, debt: updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// Delete a debt
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'Debt ID required' }, { status: 400 })

    const existing = await db.debt.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ ok: false, error: 'Debt not found' }, { status: 404 })
    await db.debt.delete({ where: { id } })

    return NextResponse.json({ ok: true, message: 'Debt deleted' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
