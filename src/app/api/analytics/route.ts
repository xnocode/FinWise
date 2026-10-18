// Advanced Analytics endpoint
// Computes:
// 1. Financial Health Score (composite 0-100 with sub-scores)
// 2. Spend Velocity (current month pace vs ideal pace)
// 3. 30-day Cash Flow Forecast (Holt-Winters exponential smoothing)
// 4. Compound Growth Projections for each goal
// 5. Savings trajectory analysis
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ─── Holt-Winters exponential smoothing forecast ────────────────────────
function holtWintersForecast(
  series: number[],
  horizon: number,
  alpha = 0.4,  // level smoothing
  beta = 0.2,   // trend smoothing
  gamma = 0.1,  // seasonal smoothing (12 months)
  seasonLength = 12
): { forecast: number[]; lower: number[]; upper: number[]; rmse: number } {
  if (series.length < 4) {
    const mean = series.reduce((s, x) => s + x, 0) / Math.max(1, series.length)
    return {
      forecast: Array(horizon).fill(mean),
      lower: Array(horizon).fill(mean * 0.5),
      upper: Array(horizon).fill(mean * 1.5),
      rmse: mean * 0.3,
    }
  }
  let level = series[0]
  let trend = series[1] - series[0]
  const seasons: number[] = []
  const residuals: number[] = []

  for (let i = 0; i < series.length; i++) {
    const seasonalIdx = i % seasonLength
    if (i < seasonLength) {
      seasons[i] = series[i] - level
    } else {
      const prevLevel = level
      const newLevel = alpha * (series[i] - seasons[seasonalIdx]) + (1 - alpha) * (level + trend)
      trend = beta * (newLevel - prevLevel) + (1 - beta) * trend
      level = newLevel
      seasons[seasonalIdx] = gamma * (series[i] - level) + (1 - gamma) * seasons[seasonalIdx]
    }
    const fitted = level + trend + seasons[seasonalIdx]
    residuals.push(series[i] - fitted)
  }

  const forecast: number[] = []
  for (let h = 1; h <= horizon; h++) {
    const idx = (series.length + h - 1) % seasonLength
    forecast.push(Math.max(0, level + h * trend + seasons[idx]))
  }
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
  const lower = forecast.map(f => Math.max(0, f - 1.96 * rmse))
  const upper = forecast.map(f => f + 1.96 * rmse)

  return { forecast, lower, upper, rmse }
}

// ─── Compound growth projection ─────────────────────────────────────────
function compoundProjection(
  principal: number,
  monthlyContribution: number,
  annualReturnRate: number,  // e.g. 0.07 for 7%
  months: number
): { month: number; balance: number; contributions: number; gains: number }[] {
  const monthlyRate = annualReturnRate / 12
  let balance = principal
  let contributions = principal
  const out = [{ month: 0, balance, contributions, gains: 0 }]
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution
    contributions += monthlyContribution
    out.push({ month: m, balance: Math.round(balance), contributions: Math.round(contributions), gains: Math.round(balance - contributions) })
  }
  return out
}

// ─── Financial Health Score calculation ─────────────────────────────────
function calcHealthScore(input: {
  savingsRate: number            // 0-1 (net savings / income)
  budgetAdherence: number        // 0-1 (avg % of budgets used, capped at 1)
  emergencyFundMonths: number    // months of expenses covered
  anomalyRate: number            // 0-1 (anomalies / total transactions)
  goalProgress: number           // 0-1 (avg % complete across goals)
}): { score: number; subscores: { label: string; value: number; weight: number; raw: number }[]; grade: string; insight: string } {
  // Savings rate subscore (30%) — 20%+ savings rate = perfect
  const savingsSub = Math.min(100, (input.savingsRate / 0.20) * 100)
  // Budget adherence (25%) — penalize both over and severe under
  const budgetSub = Math.min(100, input.budgetAdherence <= 1 ? input.budgetAdherence * 100 : Math.max(0, 100 - (input.budgetAdherence - 1) * 200))
  // Emergency fund coverage (20%) — 6 months = perfect
  const emergencySub = Math.min(100, (input.emergencyFundMonths / 6) * 100)
  // Spending stability (15%) — fewer anomalies = better
  const stabilitySub = Math.max(0, 100 - input.anomalyRate * 500)
  // Goal progress (10%)
  const goalSub = input.goalProgress * 100

  const score = Math.round(
    savingsSub * 0.30 +
    budgetSub * 0.25 +
    emergencySub * 0.20 +
    stabilitySub * 0.15 +
    goalSub * 0.10
  )

  const subscores = [
    { label: 'Savings Rate', value: Math.round(savingsSub), weight: 30, raw: input.savingsRate },
    { label: 'Budget Adherence', value: Math.round(budgetSub), weight: 25, raw: input.budgetAdherence },
    { label: 'Emergency Fund', value: Math.round(emergencySub), weight: 20, raw: input.emergencyFundMonths },
    { label: 'Spending Stability', value: Math.round(stabilitySub), weight: 15, raw: input.anomalyRate },
    { label: 'Goal Progress', value: Math.round(goalSub), weight: 10, raw: input.goalProgress },
  ]

  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : score >= 40 ? 'Needs Work' : 'Critical'
  const insight = score >= 85
    ? 'Your finances are in excellent shape — keep up the disciplined savings and consider increasing investment contributions.'
    : score >= 70
    ? 'Solid financial health with room to improve. Focus on the weakest subscore to push into the excellent range.'
    : score >= 55
    ? 'You\'re on track but have clear improvement areas. Review the subscores below and prioritize the lowest one.'
    : score >= 40
    ? 'Several areas need attention. Start with savings rate and budget adherence — these compound over time.'
    : 'Critical — focus on building an emergency fund and bringing spending in line with your budget.'

  return { score, subscores, grade, insight }
}

export async function GET() {
  const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [allTx, thisMonthTx, budgets, goals, anomalies] = await Promise.all([
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: sixMonthsAgo } },
      include: { category: true },
      orderBy: { date: 'asc' },
    }),
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: monthStart, lte: monthEnd } },
    }),
    db.budget.findMany({ where: { userId: user.id, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } }),
    db.goal.findMany({ where: { userId: user.id } }),
    db.transaction.findMany({ where: { userId: user.id, anomaly: true } }),
  ])

  // ─── Monthly spend series for forecast ──────────────────────────────
  const monthlySpend: { month: string; cents: number }[] = []
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59)
    const spend = allTx
      .filter(t => t.date >= start && t.date <= end && t.direction === 'debit')
      .reduce((s, t) => s + t.amountCents, 0)
    monthlySpend.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      cents: spend,
    })
  }

  // Daily spend series for last 30 days (for 30-day forecast)
  const dailySpend: number[] = []
  for (let d = 29; d >= 0; d--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 0, 0, 0)
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 23, 59, 59)
    const spend = allTx
      .filter(t => t.date >= dayStart && t.date <= dayEnd && t.direction === 'debit')
      .reduce((s, t) => s + t.amountCents, 0)
    dailySpend.push(spend)
  }

  // Forecast next 14 days
  const { forecast, lower, upper, rmse } = holtWintersForecast(dailySpend, 14, 0.4, 0.2, 0.15, 7)

  const forecastPoints = forecast.map((f, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1)
    return {
      day: i + 1,
      date: date.toISOString().split('T')[0],
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      predicted: Math.round(f),
      lower: Math.round(lower[i]),
      upper: Math.round(upper[i]),
    }
  })

  // ─── Spend velocity (current month) ────────────────────────────────
  const totalBudgetCents = budgets.reduce((s, b) => s + b.amountCents, 0)
  const monthSpendCents = thisMonthTx
    .filter(t => t.direction === 'debit')
    .reduce((s, t) => s + t.amountCents, 0)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const idealPace = (dayOfMonth / daysInMonth) * 100  // % of month elapsed
  const actualPace = totalBudgetCents > 0 ? (monthSpendCents / totalBudgetCents) * 100 : 0
  const velocityDelta = actualPace - idealPace
  const projectedMonthEnd = (monthSpendCents / dayOfMonth) * daysInMonth
  const projectedOver = projectedMonthEnd - totalBudgetCents

  // ─── Health score inputs ───────────────────────────────────────────
  const sixMoIncome = allTx.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)
  const sixMoSpend = allTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const savingsRate = sixMoIncome > 0 ? (sixMoIncome - sixMoSpend) / sixMoIncome : 0
  const budgetAdherence = totalBudgetCents > 0 ? monthSpendCents / totalBudgetCents : 0
  const emergencyFundMonths = goals.find(g => g.name.toLowerCase().includes('emergency'))
    ? (goals.find(g => g.name.toLowerCase().includes('emergency'))!.savedCents / Math.max(1, sixMoSpend / 6))
    : 0
  const anomalyRate = allTx.length > 0 ? anomalies.length / allTx.length : 0
  const goalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + Math.min(1, g.savedCents / g.targetCents), 0) / goals.length
    : 0

  const healthScore = calcHealthScore({
    savingsRate, budgetAdherence, emergencyFundMonths, anomalyRate, goalProgress,
  })

  // ─── Compound projections per goal ─────────────────────────────────
  const ASSUMED_RETURN = 0.07  // 7% annual (conservative index fund)
  const goalsProjection = goals.map(g => {
    const monthsToTarget = g.monthlyContributionCents > 0
      ? Math.ceil((g.targetCents - g.savedCents) / g.monthlyContributionCents)
      : 999
    const projection = compoundProjection(
      g.savedCents,
      g.monthlyContributionCents,
      ASSUMED_RETURN,
      Math.min(monthsToTarget + 12, 120)  // cap at 10 years
    )
    const finalRow = projection[projection.length - 1]
    const noInvestProjection = compoundProjection(g.savedCents, g.monthlyContributionCents, 0, monthsToTarget)
    const noInvestFinal = noInvestProjection[noInvestProjection.length - 1]
    const investmentGains = finalRow.balance - noInvestFinal.balance

    return {
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      monthlyContributionCents: g.monthlyContributionCents,
      monthsToTarget,
      projectedBalanceCents: finalRow.balance,
      projectedGainsCents: investmentGains,
      assumedReturnRate: ASSUMED_RETURN,
      projectionSeries: projection.filter((_, i) => i % 6 === 0 || i === projection.length - 1),  // sample every 6 months
      targetDate: new Date(now.getFullYear(), now.getMonth() + monthsToTarget, 1).toISOString().split('T')[0],
    }
  })

  // ─── Savings trajectory (cumulative savings over 6 months) ────────
  let cumulative = 0
  const savingsTrajectory = monthlySpend.map(m => {
    const monthIncome = allTx
      .filter(t => {
        const tm = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
        return tm === m.month && t.direction === 'credit'
      })
      .reduce((s, t) => s + t.amountCents, 0)
    cumulative += monthIncome - m.cents
    return {
      month: m.month,
      label: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income: monthIncome,
      spend: m.cents,
      net: monthIncome - m.cents,
      cumulative,
    }
  })

  return NextResponse.json({
    ok: true,
    healthScore,
    spendVelocity: {
      idealPace: Math.round(idealPace * 10) / 10,
      actualPace: Math.round(actualPace * 10) / 10,
      velocityDelta: Math.round(velocityDelta * 10) / 10,
      monthSpendCents,
      totalBudgetCents,
      projectedMonthEndCents: Math.round(projectedMonthEnd),
      projectedOverCents: Math.round(projectedOver),
      dayOfMonth,
      daysInMonth,
      daysRemaining: daysInMonth - dayOfMonth,
      dailyAvgCents: dayOfMonth > 0 ? Math.round(monthSpendCents / dayOfMonth) : 0,
      recommendedDailyCents: (totalBudgetCents - monthSpendCents) / Math.max(1, daysInMonth - dayOfMonth),
    },
    cashFlowForecast: {
      forecast: forecastPoints,
      rmse,
      confidence: rmse > 0 ? Math.max(0, Math.min(100, 100 - (rmse / (dailySpend.reduce((s, x) => s + x, 0) / dailySpend.length)) * 100)) : 100,
      historicalAvgDaily: Math.round(dailySpend.reduce((s, x) => s + x, 0) / dailySpend.length),
      forecastAvgDaily: Math.round(forecast.reduce((s, x) => s + x, 0) / forecast.length),
    },
    goalsProjection,
    savingsTrajectory,
    monthlySpend,
    assumptions: {
      investmentReturnRate: ASSUMED_RETURN,
      forecastHorizon: 14,
      forecastModel: 'Holt-Winters (level=0.4, trend=0.2, seasonal=0.15, period=7d)',
    },
  })
}
