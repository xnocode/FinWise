// Advanced Analytics endpoint
// Computes:
// 1. Financial Health Score (composite 0-100 with sub-scores)
// 2. Spend Velocity (current month pace vs ideal pace)
// 3. 30-day Cash Flow Forecast (Holt-Winters exponential smoothing)
// 4. Compound Growth Projections for each goal
// 5. Savings trajectory analysis
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

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

// ─── Seasonal decomposition (additive) ──────────────────────────────────
function seasonalDecompose(series: number[], period: number = 7) {
  if (series.length < period * 2) {
    return { trend: series, seasonal: Array(series.length).fill(0), residual: Array(series.length).fill(0) }
  }
  // Trend: centered moving average
  const trend: number[] = []
  const half = Math.floor(period / 2)
  for (let i = 0; i < series.length; i++) {
    if (i < half || i >= series.length - half) {
      trend.push(series[i])
    } else {
      const window = series.slice(i - half, i + half + 1)
      trend.push(window.reduce((s, x) => s + x, 0) / window.length)
    }
  }
  // Seasonal: average detrended by phase
  const detrended = series.map((v, i) => v - trend[i])
  const seasonalByPhase: number[] = Array(period).fill(0)
  const counts: number[] = Array(period).fill(0)
  for (let i = 0; i < series.length; i++) {
    const phase = i % period
    seasonalByPhase[phase] += detrended[i]
    counts[phase]++
  }
  for (let p = 0; p < period; p++) seasonalByPhase[p] /= Math.max(1, counts[p])
  // Normalize seasonal to mean 0
  const seasonalMean = seasonalByPhase.reduce((s, x) => s + x, 0) / period
  const seasonalNormalized = seasonalByPhase.map(x => x - seasonalMean)
  const seasonal = series.map((_, i) => seasonalNormalized[i % period])
  const residual = series.map((v, i) => v - trend[i] - seasonal[i])
  return { trend, seasonal, residual }
}

// ─── Savings Goal Optimizer (greedy LP-like allocation) ─────────────────
function optimizeGoalAllocation(
  goals: { id: string; name: string; targetCents: number; savedCents: number; monthlyContributionCents: number }[],
  totalAvailable: number  // monthly savings pool in cents
): { id: string; name: string; currentAllocation: number; optimalAllocation: number; monthsToComplete: number; optimalMonthsToComplete: number; improvementDays: number }[] {
  // Strategy: prioritize by "closest to completion" (highest savedCents/targetCents ratio)
  // — finishing goals frees up cash for the next one (snowball approach)
  const sorted = [...goals].sort((a, b) =>
    (b.savedCents / b.targetCents) - (a.savedCents / a.targetCents)
  )
  let remaining = totalAvailable
  const allocations: Record<string, number> = {}
  // First pass: give each goal its minimum (current contribution) to maintain momentum
  for (const g of sorted) {
    const minAllocation = Math.min(g.monthlyContributionCents, remaining)
    allocations[g.id] = minAllocation
    remaining -= minAllocation
  }
  // Second pass: pour remaining into the closest-to-completion goal that isn't done
  for (const g of sorted) {
    if (remaining <= 0) break
    const remaining_to_target = g.targetCents - g.savedCents
    if (remaining_to_target <= 0) continue
    const boost = Math.min(remaining, remaining_to_target / 3)  // cap to 1/3 of remaining gap
    allocations[g.id] += boost
    remaining -= boost
  }
  // Final pass: distribute any leftover equally among incomplete goals
  const incomplete = sorted.filter(g => g.savedCents < g.targetCents)
  if (incomplete.length > 0 && remaining > 0) {
    const share = remaining / incomplete.length
    for (const g of incomplete) allocations[g.id] += share
  }

  return sorted.map(g => {
    const optimalAllocation = Math.round(allocations[g.id] || 0)
    const monthsToComplete = g.monthlyContributionCents > 0
      ? Math.ceil((g.targetCents - g.savedCents) / g.monthlyContributionCents)
      : 999
    const optimalMonthsToComplete = optimalAllocation > 0
      ? Math.ceil((g.targetCents - g.savedCents) / optimalAllocation)
      : 999
    return {
      id: g.id,
      name: g.name,
      currentAllocation: g.monthlyContributionCents,
      optimalAllocation,
      monthsToComplete,
      optimalMonthsToComplete,
      improvementDays: Math.max(0, (monthsToComplete - optimalMonthsToComplete) * 30),
    }
  })
}

// ─── 5-Year Monte Carlo simulation ──────────────────────────────────────
function monteCarlo5Year(
  startingBalance: number,
  monthlyContribution: number,
  annualReturn: number,
  annualVolatility: number,  // std dev of returns
  months: number = 60,
  trials: number = 500
): { finalBalances: number[]; percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number }; successProbability: number; histogram: { bucket: string; count: number; lower: number; upper: number }[] } {
  const monthlyReturn = annualReturn / 12
  const monthlyVol = annualVolatility / Math.sqrt(12)
  const finalBalances: number[] = []

  for (let t = 0; t < trials; t++) {
    let balance = startingBalance
    for (let m = 0; m < months; m++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random()
      const u2 = Math.random()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      const shock = monthlyReturn + z * monthlyVol
      balance = Math.max(0, balance * (1 + shock) + monthlyContribution)
    }
    finalBalances.push(Math.round(balance))
  }

  finalBalances.sort((a, b) => a - b)
  const pct = (p: number) => finalBalances[Math.floor(trials * p)]
  const percentiles = {
    p5: pct(0.05),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p95: pct(0.95),
  }
  // Success = exceeds starting + total contributions
  const target = startingBalance + monthlyContribution * months
  const successProbability = Math.round(finalBalances.filter(b => b >= target).length / trials * 100)

  // Histogram (10 buckets)
  const min = finalBalances[0]
  const max = finalBalances[trials - 1]
  const range = max - min || 1
  const bucketSize = range / 10
  const histogram = Array.from({ length: 10 }, (_, i) => {
    const lower = Math.round(min + i * bucketSize)
    const upper = Math.round(min + (i + 1) * bucketSize)
    const count = finalBalances.filter(b => b >= lower && b < upper).length
    return {
      bucket: fmt_bucket(lower / 100),
      count,
      lower: lower / 100,
      upper: upper / 100,
    }
  })
  return { finalBalances, percentiles, successProbability, histogram }
}

function fmt_bucket(cents: number): string {
  if (cents >= 1000000) return `$${(cents / 1000000).toFixed(1)}M`
  if (cents >= 1000) return `$${(cents / 1000).toFixed(0)}k`
  return `$${cents.toFixed(0)}`
}

// ─── Herfindahl-Hirschman Index (merchant concentration) ────────────────
function calcHHI(merchants: { cents: number }[]): { hhi: number; topShare: number; top3Share: number; interpretation: string } {
  const total = merchants.reduce((s, m) => s + m.cents, 0)
  if (total === 0 || merchants.length === 0) {
    return { hhi: 0, topShare: 0, top3Share: 0, interpretation: 'No data' }
  }
  const shares = merchants.map(m => (m.cents / total) * 100)
  const hhi = shares.reduce((s, sh) => s + sh * sh, 0)
  const sortedShares = [...shares].sort((a, b) => b - a)
  const topShare = sortedShares[0] || 0
  const top3Share = sortedShares.slice(0, 3).reduce((s, x) => s + x, 0)
  const interpretation = hhi < 1500
    ? 'Diversified spending — low merchant concentration risk'
    : hhi < 2500
    ? 'Moderate concentration — top merchants have meaningful share'
    : 'High concentration — spending heavily concentrated in few merchants'
  return { hhi: Math.round(hhi), topShare: Math.round(topShare), top3Share: Math.round(top3Share), interpretation }
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

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

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

  // ─── Spending heatmap (last 365 days, GitHub-style) ──────────────
  const heatmapData: { date: string; day: string; spend: number; level: 0 | 1 | 2 | 3 | 4 }[] = []
  for (let d = 364; d >= 0; d--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 0, 0, 0)
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 23, 59, 59)
    const spend = allTx
      .filter(t => t.date >= dayStart && t.date <= dayEnd && t.direction === 'debit')
      .reduce((s, t) => s + t.amountCents, 0)
    // Logarithmic level mapping for better visualization
    let level: 0 | 1 | 2 | 3 | 4 = 0
    if (spend > 0) level = 1
    if (spend > 2000) level = 2     // $20+
    if (spend > 5000) level = 3     // $50+
    if (spend > 15000) level = 4    // $150+
    heatmapData.push({
      date: dayStart.toISOString().split('T')[0],
      day: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      spend,
      level,
    })
  }

  // ─── Seasonal decomposition (last 30 days, weekly seasonality) ────
  const seasonal = seasonalDecompose(dailySpend, 7)
  const seasonalData = dailySpend.map((v, i) => ({
    day: i,
    label: `D${i + 1}`,
    observed: v,
    trend: Math.round(seasonal.trend[i]),
    seasonal: Math.round(seasonal.seasonal[i]),
    residual: Math.round(seasonal.residual[i]),
  }))

  // ─── 5-Year Monte Carlo simulation ────────────────────────────────
  const totalSavingsNow = goals.reduce((s, g) => s + g.savedCents, 0)
  const monthlySavingsPool = goals.reduce((s, g) => s + g.monthlyContributionCents, 0)
  const monteCarlo = monteCarlo5Year(
    totalSavingsNow,
    monthlySavingsPool,
    0.07,    // 7% expected annual return
    0.15,    // 15% volatility (typical equity index)
    60,      // 5 years
    500      // 500 trials
  )

  // ─── Savings Goal Optimizer ───────────────────────────────────────
  const goalOptimizer = optimizeGoalAllocation(
    goals.map(g => ({
      id: g.id, name: g.name, targetCents: g.targetCents,
      savedCents: g.savedCents, monthlyContributionCents: g.monthlyContributionCents,
    })),
    monthlySavingsPool
  )

  // ─── Merchant Concentration (HHI) ─────────────────────────────────
  const merchantSpend: Record<string, number> = {}
  for (const t of allTx) {
    if (t.direction !== 'debit') continue
    merchantSpend[t.merchantNorm] = (merchantSpend[t.merchantNorm] || 0) + t.amountCents
  }
  const merchantList = Object.entries(merchantSpend)
    .map(([merchant, cents]) => ({ merchant, cents }))
    .sort((a, b) => b.cents - a.cents)
  const hhi = calcHHI(merchantList)

  // ─── Financial Stress Index (multi-factor risk) ───────────────────
  // Combines: budget overruns, anomaly rate, savings rate volatility, low emergency fund
  const budgetOverrunRate = budgets.length > 0
    ? budgets.filter(b => {
        const spent = thisMonthTx.filter(t => t.direction === 'debit' && t.categoryId === b.categoryId).reduce((s, t) => s + t.amountCents, 0)
        return b.amountCents > 0 && (spent / b.amountCents) * 100 > 100
      }).length / budgets.length
    : 0
  const savingsVolatility = (() => {
    const nets = savingsTrajectory.map(s => s.net)
    if (nets.length < 2) return 0
    const mean = nets.reduce((s, x) => s + x, 0) / nets.length
    const variance = nets.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / nets.length
    return mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0
  })()
  const stressScore = Math.round(
    (budgetOverrunRate * 30) +
    (anomalyRate * 200) +           // scaled since usually <0.1
    (savingsVolatility * 25) +
    (Math.max(0, 1 - emergencyFundMonths / 6) * 20)
  )
  const stressLevel = stressScore < 25 ? 'Low' : stressScore < 50 ? 'Moderate' : stressScore < 75 ? 'Elevated' : 'High'

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
    // ─── New advanced analytics ─────────────────────────────────────
    heatmap: heatmapData,
    seasonalDecomposition: seasonalData,
    monteCarlo: {
      ...monteCarlo,
      trials: 500,
      horizon: '5 years',
      startingBalance: totalSavingsNow,
      monthlyContribution: monthlySavingsPool,
      annualReturn: 0.07,
      annualVolatility: 0.15,
    },
    goalOptimizer: {
      totalAvailableCents: monthlySavingsPool,
      allocations: goalOptimizer,
      strategy: 'Snowball — prioritize goals closest to completion',
    },
    merchantConcentration: {
      ...hhi,
      topMerchants: merchantList.slice(0, 5).map((m, i) => ({
        rank: i + 1,
        merchant: m.merchant,
        cents: m.cents,
        share: Math.round((m.cents / merchantList.reduce((s, x) => s + x.cents, 0)) * 100),
      })),
      totalMerchants: merchantList.length,
    },
    financialStress: {
      score: Math.min(100, stressScore),
      level: stressLevel,
      factors: [
        { label: 'Budget Overruns', value: Math.round(budgetOverrunRate * 100), contribution: Math.round(budgetOverrunRate * 30) },
        { label: 'Anomaly Rate', value: Math.round(anomalyRate * 1000) / 10, contribution: Math.round(anomalyRate * 200) },
        { label: 'Savings Volatility', value: Math.round(savingsVolatility * 100), contribution: Math.round(savingsVolatility * 25) },
        { label: 'Emergency Fund Gap', value: Math.round(Math.max(0, 1 - emergencyFundMonths / 6) * 100), contribution: Math.round(Math.max(0, 1 - emergencyFundMonths / 6) * 20) },
      ],
    },
    assumptions: {
      investmentReturnRate: ASSUMED_RETURN,
      forecastHorizon: 14,
      forecastModel: 'Holt-Winters (level=0.4, trend=0.2, seasonal=0.15, period=7d)',
      monteCarloTrials: 500,
      monteCarloVolatility: 0.15,
      seasonalPeriod: 7,
    },
  })
}
