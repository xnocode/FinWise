// Innovation Lab — 5 novel features that no personal finance app has:
// 1. Financial Personality DNA — clusters user into personality archetype
// 2. Future Self Simulator — projects lifestyle at age milestones (30/40/50/65)
// 3. Behavioral Trigger Detection — mines patterns like "spend 40% more on Fridays"
// 4. Time-Value Calculator — converts spending to hours worked + 30-yr opportunity cost
// 5. Goal Collision Detector — multi-goal constraint solver
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserEmail } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── 1. Financial Personality DNA ───────────────────────────────────────
// Cluster user behavior into one of 5 archetypes based on spending patterns
function calcPersonality(input: {
  savingsRate: number
  budgetAdherence: number
  discretionaryRatio: number       // % of spend on dining/entertainment/shopping
  recurringRatio: number           // % of spend on subscriptions/recurring
  anomalyRate: number
  goalProgress: number
  variability: number              // coefficient of variation in monthly spend
}): { type: string; emoji: string; description: string; traits: { label: string; value: number }[]; matchedTraits: string[]; recommendations: string[] } {
  // Compute trait scores 0-100
  const discipline = Math.round((input.budgetAdherence * 0.4 + (1 - Math.min(1, input.variability)) * 0.3 + input.goalProgress * 0.3) * 100)
  const spontaneity = Math.round((input.discretionaryRatio * 0.5 + (1 - input.budgetAdherence) * 0.3 + input.anomalyRate * 5 * 0.2) * 100)
  const consistency = Math.round((1 - Math.min(1, input.variability)) * 100)
  const ambition = Math.round((input.goalProgress * 0.5 + Math.min(1, input.savingsRate / 0.2) * 0.5) * 100)
  const frugality = Math.round((input.savingsRate * 5 * 0.4 + (1 - input.discretionaryRatio) * 0.4 + (1 - input.anomalyRate * 5) * 0.2) * 100)

  // Classify based on trait profile
  let type, emoji, description
  const matchedTraits: string[] = []
  const recommendations: string[] = []

  if (discipline > 70 && frugality > 60) {
    type = 'The Architect'
    emoji = '🏛️'
    description = 'Methodical, disciplined, and forward-thinking. You build wealth systematically with clear plans and stick to them. Your finances are structured and intentional.'
    matchedTraits.push('High budget discipline', 'Strong savings rate', 'Low spending volatility')
    recommendations.push('Consider increasing investment aggressiveness — your discipline can handle market volatility', 'Explore tax-advantaged accounts you may be underutilizing')
  } else if (spontaneity > 65 && discipline < 50) {
    type = 'The Free Spirit'
    emoji = '🌊'
    description = 'Spontaneous, experience-driven, and present-focused. You prioritize living in the moment over rigid planning. Your spending reflects your values but can be unpredictable.'
    matchedTraits.push('High discretionary spend', 'Below-average budget adherence', 'Frequent spontaneous purchases')
    recommendations.push('Set up automatic savings transfers on payday — save before you can spend', 'Use "cooling off" rules for purchases over $100')
  } else if (ambition > 70 && discipline > 50) {
    type = 'The Climber'
    emoji = '🚀'
    description = 'Ambitious, goal-oriented, and growth-focused. You balance enjoying today with building tomorrow. Your goals drive your financial decisions.'
    matchedTraits.push('Strong goal progress', 'Above-average savings', 'Active planning behavior')
    recommendations.push('Increase your investment contributions — your trajectory supports it', 'Consider diversifying goals across short/medium/long term')
  } else if (frugality > 70 && spontaneity < 40) {
    type = 'The Guardian'
    emoji = '🛡️'
    description = 'Cautious, protective, and security-focused. You prioritize stability and emergency preparedness. Your spending is conservative and intentional.'
    matchedTraits.push('High savings rate', 'Low discretionary spend', 'Strong emergency fund focus')
    recommendations.push('Your caution is a strength — consider slightly higher-yield investments to outpace inflation', 'Review whether over-frugality is costing you joy')
  } else {
    type = 'The Explorer'
    emoji = '🧭'
    description = 'Balanced, adaptable, and curious. You\'re finding your financial style — some months disciplined, others spontaneous. This is the most common starting point.'
    matchedTraits.push('Mixed spending patterns', 'Moderate savings rate', 'Average budget adherence')
    recommendations.push('Pick one financial habit to master this month (e.g., tracking every expense)', 'Define 3 concrete financial goals for the next 12 months')
  }

  return {
    type,
    emoji,
    description,
    traits: [
      { label: 'Discipline', value: Math.min(100, Math.max(0, discipline)) },
      { label: 'Spontaneity', value: Math.min(100, Math.max(0, spontaneity)) },
      { label: 'Consistency', value: Math.min(100, Math.max(0, consistency)) },
      { label: 'Ambition', value: Math.min(100, Math.max(0, ambition)) },
      { label: 'Frugality', value: Math.min(100, Math.max(0, frugality)) },
    ],
    matchedTraits,
    recommendations,
  }
}

// ─── 2. Future Self Simulator ───────────────────────────────────────────
// Projects lifestyle at age milestones based on current trajectory
function simulateFutureSelf(input: {
  currentAge: number
  currentSavingsCents: number
  monthlySavingsCents: number
  monthlySpendCents: number
  annualReturn: number
  inflationRate: number
}): { milestones: { age: number; netWorthCents: number; annualPassiveIncomeCents: number; lifestyle: string; retirementReady: boolean; yearsToFire: number | null }[]; fireNumberCents: number; fireProgress: number } {
  const milestones: { age: number; netWorthCents: number; annualPassiveIncomeCents: number; lifestyle: string; retirementReady: boolean; yearsToFire: number | null }[] = []
  // FIRE number = 25x annual expenses (4% rule)
  const annualExpenses = input.monthlySpendCents * 12
  const fireNumber = annualExpenses * 25
  let yearsToFire: number | null = null
  let fireReached = false

  for (const targetAge of [30, 40, 50, 65, 80]) {
    if (targetAge <= input.currentAge) continue
    const years = targetAge - input.currentAge
    const months = years * 12
    let balance = input.currentSavingsCents
    const monthlyReturn = input.annualReturn / 12
    for (let m = 0; m < months; m++) {
      balance = balance * (1 + monthlyReturn) + input.monthlySavingsCents
    }
    // Adjust for inflation
    const inflationAdjusted = balance / Math.pow(1 + input.inflationRate, years)
    const annualPassiveIncome = inflationAdjusted * 0.04  // 4% withdrawal rate
    const retirementReady = inflationAdjusted >= fireNumber
    if (retirementReady && !fireReached) {
      // Calculate exact year FIRE is reached
      let bal = input.currentSavingsCents
      for (let m = 0; m < 12 * 60; m++) {
        bal = bal * (1 + monthlyReturn) + input.monthlySavingsCents
        if (bal >= fireNumber) {
          yearsToFire = Math.ceil((m + 1) / 12)
          fireReached = true
          break
        }
      }
    }

    // Lifestyle description based on passive income vs expenses
    let lifestyle: string
    if (annualPassiveIncome >= annualExpenses * 2) {
      lifestyle = 'Financial abundance — passive income exceeds 2x expenses'
    } else if (annualPassiveIncome >= annualExpenses) {
      lifestyle = 'Financial independence — passive income covers all expenses'
    } else if (annualPassiveIncome >= annualExpenses * 0.5) {
      lifestyle = 'Comfortable — passive income covers half of expenses'
    } else if (annualPassiveIncome > 0) {
      lifestyle = 'Building — passive income starting to materialize'
    } else {
      lifestyle = 'Dependent on active income'
    }

    milestones.push({
      age: targetAge,
      netWorthCents: Math.round(inflationAdjusted),
      annualPassiveIncomeCents: Math.round(annualPassiveIncome),
      lifestyle,
      retirementReady,
      yearsToFire: null,  // only set on the milestone where FIRE is first reached
    })
  }

  // Set yearsToFire on the milestone where it's first reached
  if (yearsToFire !== null) {
    const fireAge = input.currentAge + yearsToFire
    const milestone = milestones.find(m => m.age >= fireAge)
    if (milestone) milestone.yearsToFire = yearsToFire
  }

  return {
    milestones,
    fireNumberCents: fireNumber,
    fireProgress: Math.round((input.currentSavingsCents / fireNumber) * 100),
  }
}

// ─── 3. Behavioral Trigger Detection ────────────────────────────────────
// Mines patterns: "you spend 40% more on Fridays", "subscriptions spike after paydays"
function detectTriggers(transactions: any[]): { triggers: { pattern: string; description: string; impact: number; confidence: number; samples: number }[] } {
  const triggers: { pattern: string; description: string; impact: number; confidence: number; samples: number }[] = []
  if (transactions.length < 20) return { triggers }

  // ─── Day-of-week analysis ─────────────────────────────────────
  const daySpend: Record<number, { total: number; count: number }> = {}
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  for (const t of transactions) {
    if (t.direction !== 'debit') continue
    const dow = new Date(t.date).getDay()
    if (!daySpend[dow]) daySpend[dow] = { total: 0, count: 0 }
    daySpend[dow].total += t.amountCents
    daySpend[dow].count += 1
  }
  const dayAvgs = Object.entries(daySpend).map(([d, v]) => ({ day: parseInt(d), avg: v.total / v.count, name: dayNames[parseInt(d)] }))
  if (dayAvgs.length > 0) {
    const overallAvg = dayAvgs.reduce((s, x) => s + x.avg, 0) / dayAvgs.length
    const topDay = dayAvgs.reduce((max, x) => x.avg > max.avg ? x : max, dayAvgs[0])
    const liftPct = Math.round(((topDay.avg - overallAvg) / overallAvg) * 100)
    if (liftPct > 20) {
      triggers.push({
        pattern: `${topDay.name} spending spike`,
        description: `You spend ${liftPct}% more on ${topDay.name}s than the weekly average (${dayAvgs.find(d => d.day === topDay.day)?.count} transactions). This is your highest-spend day of the week.`,
        impact: Math.round((topDay.avg - overallAvg) * 52 / 100),  // annual impact in dollars
        confidence: Math.min(95, 50 + Math.min(45, dayAvgs.find(d => d.day === topDay.day)!.count * 2)),
        samples: dayAvgs.find(d => d.day === topDay.day)!.count,
      })
    }
  }

  // ─── Payday proximity analysis ────────────────────────────────
  // Find income transactions, then check spending in 3 days after vs 3 days before
  const incomeDates = transactions.filter(t => t.direction === 'credit').map(t => new Date(t.date))
  if (incomeDates.length > 0) {
    let postPaydaySpend = 0, postPaydayCount = 0
    let prePaydaySpend = 0, prePaydayCount = 0
    for (const t of transactions) {
      if (t.direction !== 'debit') continue
      const txDate = new Date(t.date)
      for (const incDate of incomeDates) {
        const daysDiff = (txDate.getTime() - incDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysDiff >= 0 && daysDiff <= 3) {
          postPaydaySpend += t.amountCents
          postPaydayCount++
        } else if (daysDiff < 0 && daysDiff >= -3) {
          prePaydaySpend += t.amountCents
          prePaydayCount++
        }
      }
    }
    if (postPaydayCount > 3 && prePaydayCount > 3) {
      const postAvg = postPaydaySpend / postPaydayCount
      const preAvg = prePaydaySpend / prePaydayCount
      const liftPct = Math.round(((postAvg - preAvg) / preAvg) * 100)
      if (liftPct > 25) {
        triggers.push({
          pattern: 'Post-payday splurge',
          description: `You spend ${liftPct}% more in the 3 days after receiving income vs the 3 days before. This "payday effect" suggests emotional spending when cash arrives.`,
          impact: Math.round((postAvg - preAvg) * 12 / 100),  // annual impact in dollars
          confidence: Math.min(90, 50 + postPaydayCount * 2),
          samples: postPaydayCount,
        })
      }
    }
  }

  // ─── Time-of-day analysis ─────────────────────────────────────
  const hourSpend: Record<number, { total: number; count: number }> = {}
  for (const t of transactions) {
    if (t.direction !== 'debit') continue
    const hour = new Date(t.date).getHours()
    if (!hourSpend[hour]) hourSpend[hour] = { total: 0, count: 0 }
    hourSpend[hour].total += t.amountCents
    hourSpend[hour].count += 1
  }
  const hourAvgs = Object.entries(hourSpend).map(([h, v]) => ({ hour: parseInt(h), avg: v.total / v.count, count: v.count }))
  if (hourAvgs.length > 3) {
    const overallAvg = hourAvgs.reduce((s, x) => s + x.avg, 0) / hourAvgs.length
    const topHour = hourAvgs.reduce((max, x) => x.avg > max.avg ? x : max, hourAvgs[0])
    const liftPct = Math.round(((topHour.avg - overallAvg) / overallAvg) * 100)
    if (liftPct > 30 && topHour.count >= 3) {
      triggers.push({
        pattern: `${topHour.hour}:00 spending peak`,
        description: `Transactions at ${topHour.hour}:00 average ${liftPct}% higher than other hours. This may reflect impulse purchases during a specific time window.`,
        impact: Math.round((topHour.avg - overallAvg) * 30 / 100),
        confidence: Math.min(85, 50 + topHour.count * 3),
        samples: topHour.count,
      })
    }
  }

  // ─── Category clustering ──────────────────────────────────────
  const catSpend: Record<string, { total: number; count: number }> = {}
  for (const t of transactions) {
    if (t.direction !== 'debit') continue
    const cat = t.category?.name || 'Unknown'
    if (!catSpend[cat]) catSpend[cat] = { total: 0, count: 0 }
    catSpend[cat].total += t.amountCents
    catSpend[cat].count += 1
  }
  const catAvgs = Object.entries(catSpend).map(([c, v]) => ({ cat: c, avg: v.total / v.count, count: v.count }))
  if (catAvgs.length > 2) {
    const overallAvg = catAvgs.reduce((s, x) => s + x.avg, 0) / catAvgs.length
    const topCat = catAvgs.reduce((max, x) => x.avg > max.avg ? x : max, catAvgs[0])
    const liftPct = Math.round(((topCat.avg - overallAvg) / overallAvg) * 100)
    if (liftPct > 50) {
      triggers.push({
        pattern: `${topCat.cat} dominates spend`,
        description: `Your average ${topCat.cat} transaction is ${liftPct}% larger than other categories. This category has the highest per-transaction impact.`,
        impact: Math.round((topCat.avg - overallAvg) * topCat.count / 100),
        confidence: Math.min(95, 60 + topCat.count),
        samples: topCat.count,
      })
    }
  }

  // Sort by impact descending
  triggers.sort((a, b) => b.impact - a.impact)
  return { triggers: triggers.slice(0, 6) }
}

// ─── 4. Time-Value Calculator ───────────────────────────────────────────
// Converts spending to hours worked + 30-year opportunity cost
function calcTimeValue(transactions: any[], monthlyIncomeCents: number): {
  topPurchases: { merchant: string; amountCents: number; hoursWorked: number; opportunityCost30yrCents: number; category: string }[]
  totalHoursWorked: number
  totalOpportunityCost30yrCents: number
  hourlyRateCents: number
} {
  const hourlyRateCents = monthlyIncomeCents > 0 ? Math.round(monthlyIncomeCents / 160) : 0  // 160 hrs/month
  const annualReturn = 0.07
  const topPurchases = transactions
    .filter(t => t.direction === 'debit')
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 8)
    .map(t => {
      const hoursWorked = hourlyRateCents > 0 ? t.amountCents / hourlyRateCents : 0
      // Opportunity cost = if invested at 7% for 30 years
      const opportunityCost30yr = Math.round(t.amountCents * Math.pow(1 + annualReturn, 30))
      return {
        merchant: t.merchantRaw,
        amountCents: t.amountCents,
        hoursWorked: Math.round(hoursWorked * 10) / 10,
        opportunityCost30yrCents: opportunityCost30yr,
        category: t.category?.name || 'Unknown',
      }
    })

  const totalHoursWorked = topPurchases.reduce((s, p) => s + p.hoursWorked, 0)
  const totalOpportunityCost30yrCents = topPurchases.reduce((s, p) => s + p.opportunityCost30yrCents, 0)

  return { topPurchases, totalHoursWorked, totalOpportunityCost30yrCents, hourlyRateCents }
}

// ─── 5. Goal Collision Detector ─────────────────────────────────────────
// Multi-goal constraint solver: warns when goals compete for the same cash
function detectGoalCollisions(goals: any[], monthlySavingsPool: number): {
  collisions: { goalA: string; goalB: string; conflict: string; severity: 'high' | 'medium' | 'low'; resolution: string }[]
  totalDemandCents: number
  availableCents: number
  deficitCents: number
  recommendation: string
} {
  const totalDemand = goals.reduce((s, g) => s + g.monthlyContributionCents, 0)
  const deficit = totalDemand - monthlySavingsPool

  const collisions: any[] = []
  if (deficit > 0) {
    // Goals are competing — find pairs that together exceed available
    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        const a = goals[i], b = goals[j]
        const combined = a.monthlyContributionCents + b.monthlyContributionCents
        if (combined > monthlySavingsPool) {
          const monthsA = Math.ceil((a.targetCents - a.savedCents) / a.monthlyContributionCents)
          const monthsB = Math.ceil((b.targetCents - b.savedCents) / b.monthlyContributionCents)
          // If funding A delays B significantly
          const aProgress = a.savedCents / a.targetCents
          const bProgress = b.savedCents / b.targetCents
          const severity = combined > monthlySavingsPool * 1.5 ? 'high' : combined > monthlySavingsPool * 1.2 ? 'medium' : 'low'
          collisions.push({
            goalA: a.name,
            goalB: b.name,
            conflict: `Funding both ${a.name} ($${(a.monthlyContributionCents / 100).toFixed(0)}/mo) and ${b.name} ($${(b.monthlyContributionCents / 100).toFixed(0)}/mo) requires $${(combined / 100).toFixed(0)}/mo but you only have $${(monthlySavingsPool / 100).toFixed(0)}/mo available.`,
            severity,
            resolution: aProgress > bProgress
              ? `Prioritize ${a.name} (${Math.round(aProgress * 100)}% complete) — finish it first, then redirect that cash to ${b.name}.`
              : `Prioritize ${b.name} (${Math.round(bProgress * 100)}% complete) — finish it first, then redirect that cash to ${a.name}.`,
          })
        }
      }
    }
  }

  let recommendation: string
  if (deficit <= 0) {
    recommendation = 'Your goals are fully funded — no conflicts detected. Consider increasing contributions or adding new goals.'
  } else if (deficit < monthlySavingsPool * 0.2) {
    recommendation = `Small deficit of $${(deficit / 100).toFixed(0)}/mo — easily resolved by trimming discretionary spending or increasing income.`
  } else {
    recommendation = `Significant deficit of $${(deficit / 100).toFixed(0)}/mo — you cannot fund all goals at current rates. Use the collision analysis below to prioritize.`
  }

  return {
    collisions: collisions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order]
    }),
    totalDemandCents: totalDemand,
    availableCents: monthlySavingsPool,
    deficitCents: Math.max(0, deficit),
    recommendation,
  }
}

// ─── Main GET handler ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await db.user.findUnique({ where: { email: getUserEmail(req) } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [allTx, thisMonthTx, budgets, goals] = await Promise.all([
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: sixMonthsAgo } },
      include: { category: true },
      orderBy: { date: 'asc' },
    }),
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: monthStart } },
    }),
    db.budget.findMany({ where: { userId: user.id, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } }),
    db.goal.findMany({ where: { userId: user.id } }),
  ])

  // ─── Compute inputs for each feature ──────────────────────────
  const sixMoIncome = allTx.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)
  const sixMoSpend = allTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const savingsRate = sixMoIncome > 0 ? (sixMoIncome - sixMoSpend) / sixMoIncome : 0
  const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0)
  const monthSpend = thisMonthTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const budgetAdherence = totalBudget > 0 ? monthSpend / totalBudget : 0

  // Discretionary ratio
  const discretionaryCats = ['Dining', 'Entertainment', 'Shopping']
  const discretionarySpend = allTx
    .filter(t => t.direction === 'debit' && discretionaryCats.includes(t.category.name))
    .reduce((s, t) => s + t.amountCents, 0)
  const discretionaryRatio = sixMoSpend > 0 ? discretionarySpend / sixMoSpend : 0

  // Recurring ratio
  const recurringSpend = allTx.filter(t => t.direction === 'debit' && t.recurring).reduce((s, t) => s + t.amountCents, 0)
  const recurringRatio = sixMoSpend > 0 ? recurringSpend / sixMoSpend : 0

  // Anomaly rate
  const anomalyCount = allTx.filter(t => t.anomaly).length
  const anomalyRate = allTx.length > 0 ? anomalyCount / allTx.length : 0

  // Goal progress
  const goalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + Math.min(1, g.savedCents / g.targetCents), 0) / goals.length
    : 0

  // Monthly variability
  const monthlySpend: number[] = []
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59)
    const spend = allTx.filter(t => t.date >= start && t.date <= end && t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
    monthlySpend.push(spend)
  }
  const meanSpend = monthlySpend.reduce((s, x) => s + x, 0) / monthlySpend.length
  const variance = monthlySpend.reduce((s, x) => s + Math.pow(x - meanSpend, 2), 0) / monthlySpend.length
  const variability = meanSpend !== 0 ? Math.sqrt(variance) / meanSpend : 0

  // ─── 1. Personality ────────────────────────────────────────────
  const personality = calcPersonality({
    savingsRate, budgetAdherence, discretionaryRatio, recurringRatio, anomalyRate, goalProgress, variability,
  })

  // ─── 2. Future Self ────────────────────────────────────────────
  const currentAge = 28  // assumption for demo
  const currentSavings = goals.reduce((s, g) => s + g.savedCents, 0)
  const monthlySavings = Math.round(sixMoIncome / 6 - sixMoSpend / 6)
  const monthlySpendAvg = Math.round(sixMoSpend / 6)
  const futureSelf = simulateFutureSelf({
    currentAge,
    currentSavingsCents: currentSavings,
    monthlySavingsCents: Math.max(0, monthlySavings),
    monthlySpendCents: monthlySpendAvg,
    annualReturn: 0.07,
    inflationRate: 0.025,
  })

  // ─── 3. Triggers ───────────────────────────────────────────────
  const triggers = detectTriggers(allTx)

  // ─── 4. Time Value ─────────────────────────────────────────────
  const monthlyIncome = Math.round(sixMoIncome / 6)
  const timeValue = calcTimeValue(allTx, monthlyIncome)

  // ─── 5. Goal Collisions ────────────────────────────────────────
  const monthlySavingsPool = goals.reduce((s, g) => s + g.monthlyContributionCents, 0)
  const goalCollisions = detectGoalCollisions(goals, monthlySavingsPool)

  return NextResponse.json({
    ok: true,
    personality,
    futureSelf: {
      ...futureSelf,
      currentAge,
      currentSavingsCents: currentSavings,
      monthlySavingsCents: Math.max(0, monthlySavings),
      monthlySpendCents: monthlySpendAvg,
    },
    triggers,
    timeValue,
    goalCollisions,
    assumptions: {
      annualReturn: 0.07,
      inflationRate: 0.025,
      fireRule: '4% safe withdrawal rate (25x annual expenses)',
      hourlyRateBasis: '160 hours/month',
      analysisWindow: '6 months of transactions',
    },
  })
}
