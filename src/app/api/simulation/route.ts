// Simulation endpoint — Monte Carlo on a savings goal
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { goalId, additionalMonthlyCents = 0, trials = 1000 } = body
    const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
    if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

    const goals = await db.goal.findMany({ where: { userId: user.id } })
    if (!goalId) {
      return NextResponse.json({
        ok: true,
        availableGoals: goals.map(g => ({
          id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents,
        })),
      })
    }

    const goal = goals.find(g => g.id === goalId)
    if (!goal) return NextResponse.json({ ok: false, error: 'Goal not found' }, { status: 404 })

    const monthly = goal.monthlyContributionCents + additionalMonthlyCents
    const remaining = goal.targetCents - goal.savedCents
    const baseMonths = monthly > 0 ? Math.ceil(remaining / monthly) : 999

    // Monte Carlo
    const results: number[] = []
    for (let i = 0; i < trials; i++) {
      let saved = goal.savedCents
      let months = 0
      while (saved < goal.targetCents && months < 240) {
        const noise = 1 + (Math.random() - 0.5) * 0.4 // ±20% monthly income volatility
        saved += monthly * noise
        months++
      }
      results.push(months)
    }
    results.sort((a, b) => a - b)
    const median = results[Math.floor(trials * 0.5)]
    const p10 = results[Math.floor(trials * 0.1)]
    const p90 = results[Math.floor(trials * 0.9)]
    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + median)

    // Sensitivity: test 3 scenarios
    const scenarios = [
      { label: 'Cut dining 20%', monthlyDelta: 900 },
      { label: 'Cancel 2 subscriptions', monthlyDelta: 3500 },
      { label: 'Add $100/mo side income', monthlyDelta: 10000 },
    ].map(s => {
      const newMonthly = monthly + s.monthlyDelta
      const newBase = newMonthly > 0 ? Math.ceil(remaining / newMonthly) : 999
      return { ...s, newMonthlyCents: newMonthly, baseMonths: newBase, daysSaved: (baseMonths - newBase) * 30 }
    })

    return NextResponse.json({
      ok: true,
      goalName: goal.name,
      currentMonthlyCents: goal.monthlyContributionCents,
      additionalMonthlyCents,
      totalMonthlyCents: monthly,
      baseCaseMonths: baseMonths,
      medianMonths: median,
      p10Months: p10,
      p90Months: p90,
      confidenceWindow: `${p10} to ${p90} months (80% confidence)`,
      projectedDate: targetDate.toISOString().split('T')[0],
      successProbability: Math.round(results.filter(m => m <= baseMonths * 1.5).length / trials * 100),
      scenarios,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
