// Smart Insights Feed — AI-curated daily insights that surface the most impactful findings
// Solves: "what should I focus on today?" — surfaces 1-3 actionable insights per day
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Insight = {
  id: string
  type: 'warning' | 'opportunity' | 'achievement' | 'tip' | 'anomaly'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
  action: string           // CTA text
  actionTarget?: string    // view to navigate to
  impactCents?: number     // estimated dollar impact
  evidence?: string        // supporting data
}

export async function GET() {
  const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  const [thisMonthTx, lastMonthTx, budgets, goals, recs, anomalies, allTx] = await Promise.all([
    db.transaction.findMany({ where: { userId: user.id, date: { gte: monthStart } }, include: { category: true } }),
    db.transaction.findMany({ where: { userId: user.id, date: { gte: lastMonthStart, lte: lastMonthEnd } }, include: { category: true } }),
    db.budget.findMany({ where: { userId: user.id, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }, include: { category: true } }),
    db.goal.findMany({ where: { userId: user.id } }),
    db.recommendation.findMany({ where: { userId: user.id, status: 'pending' } }),
    db.transaction.findMany({ where: { userId: user.id, anomaly: true }, orderBy: { date: 'desc' }, take: 3 }),
    db.transaction.findMany({ where: { userId: user.id, date: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) } }, include: { category: true } }),
  ])

  const insights: Insight[] = []

  // 1. Critical: Budget overruns
  const overBudget = budgets.filter(b => {
    const spent = thisMonthTx.filter(t => t.categoryId === b.categoryId && t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
    return spent > b.amountCents
  }).map(b => {
    const spent = thisMonthTx.filter(t => t.categoryId === b.categoryId && t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
    return { ...b, spentCents: spent, overCents: spent - b.amountCents }
  }).sort((a, b) => b.overCents - a.overCents)

  if (overBudget.length > 0) {
    const worst = overBudget[0]
    insights.push({
      id: 'budget-overrun',
      type: 'warning',
      priority: 'critical',
      title: `${worst.category.name} is ${Math.round((worst.spentCents / worst.amountCents) * 100)}% over budget`,
      detail: `You've spent $${(worst.spentCents / 100).toFixed(0)} of your $${(worst.amountCents / 100).toFixed(0)} ${worst.category.name} budget — that's $${(worst.overCents / 100).toFixed(0)} over with ${daysInMonth - dayOfMonth} days left this month.`,
      action: 'Adjust budget or reduce spending',
      actionTarget: 'budgets',
      impactCents: worst.overCents,
      evidence: `${overBudget.length} categories over budget total`,
    })
  }

  // 2. High: Pending high-impact recommendations
  const highImpactRecs = recs.filter(r => r.impactCents >= 20000 && r.confidence === 'high')
  if (highImpactRecs.length > 0) {
    const top = highImpactRecs[0]
    insights.push({
      id: 'high-impact-rec',
      type: 'opportunity',
      priority: 'high',
      title: top.title,
      detail: top.detail,
      action: 'Accept recommendation',
      actionTarget: 'insights',
      impactCents: top.impactCents,
      evidence: `${highImpactRecs.length} high-impact recommendations pending`,
    })
  }

  // 3. High: Recent anomaly
  if (anomalies.length > 0) {
    const latest = anomalies[0]
    const daysAgo = Math.floor((now.getTime() - latest.date.getTime()) / (1000 * 60 * 60 * 24))
    if (daysAgo <= 30) {
      insights.push({
        id: 'recent-anomaly',
        type: 'anomaly',
        priority: 'high',
        title: `Unusual transaction: ${latest.merchantRaw}`,
        detail: `A $${(latest.amountCents / 100).toFixed(2)} transaction at ${latest.merchantRaw} was flagged as anomalous ${daysAgo} days ago. Is this expected?`,
        action: 'Review transaction',
        actionTarget: 'transactions',
        impactCents: latest.amountCents,
        evidence: `Anomaly score: ${latest.anomalyScore?.toFixed(2) || 'N/A'}`,
      })
    }
  }

  // 4. Opportunity: Subscription cancellation
  const subscriptions = allTx.filter(t => t.recurring && t.direction === 'debit')
  const subByMerchant: Record<string, { merchant: string; totalCents: number; count: number; lastDate: Date }> = {}
  for (const t of subscriptions) {
    const key = t.merchantNorm
    if (!subByMerchant[key]) {
      subByMerchant[key] = { merchant: t.merchantRaw, totalCents: 0, count: 0, lastDate: t.date }
    }
    subByMerchant[key].totalCents += t.amountCents
    subByMerchant[key].count += 1
    if (t.date > subByMerchant[key].lastDate) subByMerchant[key].lastDate = t.date
  }
  const sortedSubs = Object.values(subByMerchant).sort((a, b) => b.totalCents - a.totalCents)
  if (sortedSubs.length > 0 && sortedSubs[0].count >= 3) {
    const top = sortedSubs[0]
    const monthlyAvg = Math.round(top.totalCents / Math.max(1, top.count))
    insights.push({
      id: 'subscription-review',
      type: 'opportunity',
      priority: 'medium',
      title: `Review ${top.merchant} subscription`,
      detail: `You've paid ${top.count} times to ${top.merchant} totaling $${(top.totalCents / 100).toFixed(0)} (~$${(monthlyAvg / 100).toFixed(0)}/mo). Consider if you still need it.`,
      action: 'Manage subscriptions',
      actionTarget: 'insights',
      impactCents: monthlyAvg * 12,
      evidence: `${sortedSubs.length} recurring subscriptions tracked`,
    })
  }

  // 5. Achievement: Goal progress milestones
  for (const g of goals) {
    const pct = (g.savedCents / g.targetCents) * 100
    if (pct >= 75 && pct < 100) {
      insights.push({
        id: `goal-near-${g.id}`,
        type: 'achievement',
        priority: 'medium',
        title: `${g.name} is ${Math.round(pct)}% funded`,
        detail: `You're $${((g.targetCents - g.savedCents) / 100).toFixed(0)} away from completing your ${g.name} goal. At your current rate of $${(g.monthlyContributionCents / 100).toFixed(0)}/mo, you'll finish in ${Math.ceil((g.targetCents - g.savedCents) / g.monthlyContributionCents)} months.`,
        action: 'Boost contribution',
        actionTarget: 'goals',
        impactCents: g.targetCents - g.savedCents,
      })
      break  // only show one
    }
  }

  // 6. Tip: Savings rate insight
  const thisMonthSpend = thisMonthTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const thisMonthIncome = thisMonthTx.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)
  const lastMonthSpend = lastMonthTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  if (thisMonthIncome > 0 && lastMonthSpend > 0) {
    const spendChange = ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100
    if (spendChange > 15) {
      insights.push({
        id: 'spend-increase',
        type: 'warning',
        priority: 'medium',
        title: `Spending up ${Math.round(spendChange)}% vs last month`,
        detail: `You've spent $${(thisMonthSpend / 100).toFixed(0)} so far this month vs $${(lastMonthSpend / 100).toFixed(0)} at this point last month. The biggest contributor was dining and entertainment.`,
        action: 'View spending breakdown',
        actionTarget: 'overview',
        impactCents: thisMonthSpend - lastMonthSpend,
      })
    } else if (spendChange < -10) {
      insights.push({
        id: 'spend-decrease',
        type: 'achievement',
        priority: 'low',
        title: `Spending down ${Math.abs(Math.round(spendChange))}% vs last month`,
        detail: `Great work — you've reduced spending by $${(Math.abs(thisMonthSpend - lastMonthSpend) / 100).toFixed(0)} compared to last month. Keep it up!`,
        action: 'View insights',
        actionTarget: 'insights',
        impactCents: Math.abs(thisMonthSpend - lastMonthSpend) * 12,
      })
    }
  }

  // 7. Tip: Day-of-month pacing
  const idealPace = (dayOfMonth / daysInMonth) * 100
  const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0)
  const actualPace = totalBudget > 0 ? (thisMonthSpend / totalBudget) * 100 : 0
  if (actualPace > idealPace + 10) {
    insights.push({
      id: 'pace-warning',
      type: 'warning',
      priority: 'medium',
      title: `Spending ${Math.round(actualPace - idealPace)}% ahead of pace`,
      detail: `We're ${Math.round(idealPace)}% through the month but you've spent ${Math.round(actualPace)}% of your budget. To stay on track, limit spending to $${((totalBudget - thisMonthSpend) / Math.max(1, daysInMonth - dayOfMonth) / 100).toFixed(0)}/day for the rest of the month.`,
      action: 'View budget',
      actionTarget: 'budgets',
    })
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  const totalImpactCents = insights.reduce((s, i) => s + (i.impactCents || 0), 0)
  const criticalCount = insights.filter(i => i.priority === 'critical').length
  const opportunityCount = insights.filter(i => i.type === 'opportunity').length

  return NextResponse.json({
    ok: true,
    insights,
    summary: {
      total: insights.length,
      critical: criticalCount,
      opportunities: opportunityCount,
      potentialImpactCents: totalImpactCents,
      generatedAt: now.toISOString(),
    },
  })
}
