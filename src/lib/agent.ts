// FinWise Agent — Executive Personal Finance Copilot
// Implements an intelligent Supervisor-Worker architecture with deterministic tool dispatch,
// natural-language transaction CRUD, multi-currency conversion, and executive financial synthesis.

import { db } from '@/lib/db'
import { convertToUsdCents, convertFromUsdCents } from '@/lib/rates'
import { runFreeLLM } from '@/lib/free-llm'
import type { Transaction, Category, Budget, Goal, Recommendation } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────

export type ToolContext = {
  userId: string
  privacyMode: boolean
  tier: 'Viewer' | 'Editor' | 'Approver'
}

export type ToolResult = {
  tool: string
  success: boolean
  data: any
  summary: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function parseAmountFromText(text: string): number | null {
  const match = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/)
  if (!match) return null
  return Math.round(parseFloat(match[1]) * 100)
}

async function findOrCreateCategory(ctx: ToolContext, categoryText: string): Promise<string | null> {
  if (!categoryText) return null
  const trimmed = categoryText.trim()
  const existing = await db.category.findFirst({
    where: { name: { contains: trimmed, mode: 'insensitive' } },
  })
  if (existing) return existing.id

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16']
  const newCat = await db.category.create({
    data: {
      name: trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase(),
      color: colors[Math.floor(Math.random() * colors.length)],
    },
  })
  return newCat.id
}

const CATEGORY_KEYWORDS: Record<string, string> = {
  // Food & Dining
  groceries: 'Food & Dining', grocery: 'Food & Dining', supermarket: 'Food & Dining', food: 'Food & Dining',
  coffee: 'Food & Dining', cafe: 'Food & Dining', restaurant: 'Food & Dining', dining: 'Food & Dining',
  lunch: 'Food & Dining', dinner: 'Food & Dining', breakfast: 'Food & Dining', brunch: 'Food & Dining',
  pizza: 'Food & Dining', burger: 'Food & Dining', sushi: 'Food & Dining', bakery: 'Food & Dining',
  starbucks: 'Food & Dining', mcdonalds: 'Food & Dining', chipotle: 'Food & Dining', kfc: 'Food & Dining',
  subway: 'Food & Dining', snacks: 'Food & Dining', tea: 'Food & Dining', biryani: 'Food & Dining',
  sweet: 'Food & Dining', sweets: 'Food & Dining', dessert: 'Food & Dining', catering: 'Food & Dining',
  // Transport
  rickshaw: 'Transport', ricksha: 'Transport', cng: 'Transport', uber: 'Transport', lyft: 'Transport',
  taxi: 'Transport', cab: 'Transport', bus: 'Transport', train: 'Transport', metro: 'Transport',
  subway_transit: 'Transport', transit: 'Transport', gas: 'Transport', petrol: 'Transport',
  fuel: 'Transport', octane: 'Transport', toll: 'Transport', parking: 'Transport', flight: 'Transport',
  airline: 'Transport', plane: 'Transport', commute: 'Transport', fare: 'Transport', car: 'Transport',
  // Housing
  rent: 'Housing', mortgage: 'Housing', lease: 'Housing', apartment: 'Housing', condo: 'Housing', flat: 'Housing',
  // Utilities
  utilities: 'Utilities', utility: 'Utilities', electric: 'Utilities', electricity: 'Utilities',
  water: 'Utilities', gas_bill: 'Utilities', internet: 'Utilities', wifi: 'Utilities', broadband: 'Utilities',
  phone: 'Utilities', recharge: 'Utilities', mobile: 'Utilities', bill: 'Utilities', power: 'Utilities',
  // Entertainment
  entertainment: 'Entertainment', netflix: 'Entertainment', spotify: 'Entertainment', youtube: 'Entertainment',
  hulu: 'Entertainment', disney: 'Entertainment', movies: 'Entertainment', cinema: 'Entertainment',
  theater: 'Entertainment', concert: 'Entertainment', games: 'Entertainment', gaming: 'Entertainment',
  steam: 'Entertainment', playstation: 'Entertainment', xbox: 'Entertainment',
  // Shopping
  shopping: 'Shopping', clothes: 'Shopping', clothing: 'Shopping', shoes: 'Shopping', dress: 'Shopping',
  shirt: 'Shopping', pants: 'Shopping', zara: 'Shopping', amazon: 'Shopping', ebay: 'Shopping',
  daraz: 'Shopping', laptop: 'Shopping', electronics: 'Shopping', gadget: 'Shopping',
  // Healthcare
  health: 'Healthcare', healthcare: 'Healthcare', medical: 'Healthcare', doctor: 'Healthcare',
  dentist: 'Healthcare', clinic: 'Healthcare', hospital: 'Healthcare', pharmacy: 'Healthcare',
  medicine: 'Healthcare', prescription: 'Healthcare', dental: 'Healthcare',
  // Personal Care
  gym: 'Personal Care', fitness: 'Personal Care', salon: 'Personal Care', haircut: 'Personal Care',
  barber: 'Personal Care', spa: 'Personal Care', massage: 'Personal Care', beauty: 'Personal Care',
  // Education
  education: 'Education', tuition: 'Education', course: 'Education', books: 'Education',
  school: 'Education', college: 'Education', university: 'Education', udemy: 'Education',
  // Travel
  travel: 'Travel', hotel: 'Travel', airbnb: 'Travel', resort: 'Travel', vacation: 'Travel', trip: 'Travel',
  // Subscriptions
  subscription: 'Subscriptions', subscriptions: 'Subscriptions', membership: 'Subscriptions', saas: 'Subscriptions',
  // Income
  salary: 'Income', paycheck: 'Income', income: 'Income', freelance: 'Income', bonus: 'Income',
  dividend: 'Income', cashback: 'Income', refund: 'Income', deposit: 'Income', earnings: 'Income',
}

function inferCategoryFromText(text: string): string | undefined {
  const words = text.toLowerCase().match(/[a-z0-9_']+/g) || []
  for (const w of words) {
    if (CATEGORY_KEYWORDS[w]) return CATEGORY_KEYWORDS[w]
  }
  return undefined
}

// ─── Tool Implementations ────────────────────────────────────────────────

async function getTransactions(ctx: ToolContext, args: {
  categoryId?: string
  categoryName?: string
  startDate?: string
  endDate?: string
  merchant?: string
  direction?: 'debit' | 'credit'
  limit?: number
}): Promise<ToolResult> {
  const where: any = { userId: ctx.userId }

  if (args.categoryId) {
    where.categoryId = args.categoryId
  } else if (args.categoryName) {
    const cat = await db.category.findFirst({
      where: { name: { contains: args.categoryName, mode: 'insensitive' } },
    })
    if (cat) where.categoryId = cat.id
  }

  if (args.direction) {
    where.direction = args.direction
  }

  if (args.startDate || args.endDate) {
    where.date = {}
    if (args.startDate) where.date.gte = new Date(args.startDate)
    if (args.endDate) where.date.lte = new Date(args.endDate)
  }

  if (args.merchant) {
    where.merchantNorm = { contains: args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-') }
  }

  const txs = await db.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
    take: args.limit || 50,
  })

  let totalDebitCents = 0
  let totalCreditCents = 0
  const categoryTotals: Record<string, { name: string; cents: number; count: number }> = {}

  for (const t of txs) {
    if (t.direction === 'credit') {
      totalCreditCents += t.amountCents
    } else {
      totalDebitCents += t.amountCents
      const cName = t.category?.name || 'General'
      if (!categoryTotals[cName]) {
        categoryTotals[cName] = { name: cName, cents: 0, count: 0 }
      }
      categoryTotals[cName].cents += t.amountCents
      categoryTotals[cName].count++
    }
  }

  const netSavingsCents = totalCreditCents - totalDebitCents

  return {
    tool: 'get_transactions',
    success: true,
    data: {
      count: txs.length,
      totalDebitCents,
      totalCreditCents,
      netSavingsCents,
      categoryBreakdown: Object.values(categoryTotals).sort((a, b) => b.cents - a.cents),
      transactions: txs.slice(0, 15).map(t => ({
        id: t.id,
        date: t.date.toISOString().split('T')[0],
        merchant: t.merchantRaw,
        amountCents: t.amountCents,
        direction: t.direction,
        category: t.category?.name || 'General',
        currency: t.currency,
      })),
    },
    summary: `Found ${txs.length} transactions — total expenses ${formatUsd(totalDebitCents)}, income ${formatUsd(totalCreditCents)} (Net: ${formatUsd(netSavingsCents)})`,
  }
}

async function getBudget(ctx: ToolContext, args: { categoryName?: string }): Promise<ToolResult> {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const budgets = await db.budget.findMany({
    where: { userId: ctx.userId, month },
    include: { category: true },
  })

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const txs = await db.transaction.findMany({
    where: { userId: ctx.userId, date: { gte: monthStart, lte: monthEnd } },
  })

  const spendByCat: Record<string, number> = {}
  for (const t of txs) {
    if (t.direction === 'debit') {
      spendByCat[t.categoryId] = (spendByCat[t.categoryId] || 0) + t.amountCents
    }
  }

  let budgetSummary = budgets.map(b => {
    const spent = spendByCat[b.categoryId] || 0
    const remaining = b.amountCents - spent
    const pct = b.amountCents > 0 ? Math.round((spent / b.amountCents) * 100) : 0
    const status = pct > 100 ? 'Exceeded' : pct >= 80 ? 'Approaching Limit' : 'On Track'
    return {
      category: b.category.name,
      color: b.category.color,
      budgetCents: b.amountCents,
      spentCents: spent,
      remainingCents: remaining,
      percentUsed: pct,
      status,
    }
  })

  if (args.categoryName) {
    budgetSummary = budgetSummary.filter(b => b.category.toLowerCase().includes(args.categoryName!.toLowerCase()))
  }

  const totalBudgetCents = budgets.reduce((acc, b) => acc + b.amountCents, 0)
  const totalSpentCents = Object.values(spendByCat).reduce((acc, s) => acc + s, 0)

  return {
    tool: 'get_budget',
    success: true,
    data: {
      month,
      totalBudgetCents,
      totalSpentCents,
      overallPercent: totalBudgetCents > 0 ? Math.round((totalSpentCents / totalBudgetCents) * 100) : 0,
      budgets: budgetSummary,
    },
    summary: `Budget status for ${month}: ${budgetSummary.length} categories tracked. Total spent ${formatUsd(totalSpentCents)} of ${formatUsd(totalBudgetCents)} budget.`,
  }
}

async function getInsights(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [thisMonthTx, lastMonthTx, anomalies] = await Promise.all([
    db.transaction.findMany({
      where: { userId: ctx.userId, date: { gte: thisMonthStart } },
      include: { category: true },
    }),
    db.transaction.findMany({
      where: { userId: ctx.userId, date: { gte: lastMonthStart, lte: lastMonthEnd } },
      include: { category: true },
    }),
    db.transaction.findMany({
      where: { userId: ctx.userId, anomaly: true },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ])

  const sumByCat = (txs: (Transaction & { category: Category })[]) => {
    const m: Record<string, { name: string; color: string; cents: number }> = {}
    for (const t of txs) {
      if (t.direction !== 'debit') continue
      if (!m[t.categoryId]) m[t.categoryId] = { name: t.category.name, color: t.category.color, cents: 0 }
      m[t.categoryId].cents += t.amountCents
    }
    return m
  }

  const thisM = sumByCat(thisMonthTx)
  const lastM = sumByCat(lastMonthTx)
  const categories = new Set([...Object.keys(thisM), ...Object.keys(lastM)])
  const deltas: any[] = []

  for (const catId of categories) {
    const t = thisM[catId]?.cents || 0
    const l = lastM[catId]?.cents || 0
    const pctChange = l > 0 ? Math.round(((t - l) / l) * 100) : 0
    deltas.push({
      category: thisM[catId]?.name || lastM[catId]?.name,
      color: thisM[catId]?.color || lastM[catId]?.color,
      thisMonthCents: t,
      lastMonthCents: l,
      percentChange: pctChange,
    })
  }
  deltas.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))

  return {
    tool: 'get_insights',
    success: true,
    data: {
      monthOverMonth: deltas.slice(0, 5),
      anomalies: anomalies.map(a => ({
        date: a.date.toISOString().split('T')[0],
        merchant: a.merchantRaw,
        amountCents: a.amountCents,
        category: a.category.name,
        score: a.anomalyScore,
      })),
      totalAnomalies: anomalies.length,
    },
    summary: `Month-over-month variances across ${deltas.length} categories; ${anomalies.length} anomalous transactions flagged.`,
  }
}

async function getRecommendations(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
  const recs = await db.recommendation.findMany({
    where: { userId: ctx.userId, status: 'pending' },
    orderBy: { impactCents: 'desc' },
    take: 5,
  })
  const totalImpact = recs.reduce((s, r) => s + r.impactCents, 0)
  return {
    tool: 'get_recommendations',
    success: true,
    data: { recommendations: recs, totalAnnualImpactCents: totalImpact },
    summary: `${recs.length} active savings recommendations totaling ${formatUsd(totalImpact)}/yr in potential optimization.`,
  }
}

async function getGoals(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
  const goals = await db.goal.findMany({ where: { userId: ctx.userId } })
  const formatted = goals.map(g => {
    const remainingCents = Math.max(0, g.targetCents - g.savedCents)
    const monthsToTarget = g.monthlyContributionCents > 0 ? Math.ceil(remainingCents / g.monthlyContributionCents) : null
    const pct = g.targetCents > 0 ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0
    return {
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      monthlyContributionCents: g.monthlyContributionCents,
      percentComplete: pct,
      monthsRemaining: monthsToTarget,
    }
  })

  return {
    tool: 'get_goals',
    success: true,
    data: { goals: formatted },
    summary: `${goals.length} active savings goals tracked.`,
  }
}

async function runSimulation(ctx: ToolContext, args: {
  goalId?: string
  additionalMonthlyCents?: number
  trials?: number
}): Promise<ToolResult> {
  let goal: any
  if (args.goalId) {
    goal = await db.goal.findUnique({ where: { id: args.goalId } })
  } else {
    goal = await db.goal.findFirst({ where: { userId: ctx.userId }, orderBy: { updatedAt: 'desc' } })
  }

  if (!goal || goal.userId !== ctx.userId) {
    const goals = await db.goal.findMany({ where: { userId: ctx.userId } })
    return {
      tool: 'run_simulation',
      success: true,
      data: { availableGoals: goals.map(g => ({ id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents })) },
      summary: 'Please specify a goal name or create a goal first to simulate timelines.',
    }
  }

  const additional = args.additionalMonthlyCents || 0
  const monthly = Math.max(1000, goal.monthlyContributionCents + additional)
  const remaining = Math.max(0, goal.targetCents - goal.savedCents)
  const baseMonths = Math.ceil(remaining / monthly)

  const trials = args.trials || 1000
  const results: number[] = []
  for (let i = 0; i < trials; i++) {
    let saved = goal.savedCents
    let months = 0
    while (saved < goal.targetCents && months < 240) {
      const noise = 1 + (Math.random() - 0.5) * 0.4
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

  return {
    tool: 'run_simulation',
    success: true,
    data: {
      goalName: goal.name,
      monthlyContributionCents: monthly,
      baseCaseMonths: baseMonths,
      medianMonths: median,
      p10Months: p10,
      p90Months: p90,
      confidenceWindow: `${p10} to ${p90} months`,
      projectedDate: targetDate.toISOString().split('T')[0],
      successProbability: Math.round(results.filter(m => m <= baseMonths * 1.5).length / trials * 100),
    },
    summary: `Monte Carlo simulation for "${goal.name}": Median ${median} months (${p10}–${p90} months at 80% confidence). Projected finish: ${targetDate.toISOString().split('T')[0]}.`,
  }
}

// ─── Write Tools ─────────────────────────────────────────────────────────

async function addTransaction(ctx: ToolContext, args: {
  amount: number           // in cents (USD)
  merchant: string
  category?: string
  date?: string
  direction?: 'debit' | 'credit'
  memo?: string
  displayAmount?: number   // raw amount in user currency
  displayCurrency?: string // currency code (e.g. 'BDT')
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Permission denied: Viewer tier cannot add transactions.' }
  }
  if (!args.amount || args.amount <= 0) {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Invalid amount: must be greater than zero.' }
  }
  if (!args.merchant) {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Merchant or description is required.' }
  }

  const categoryName = args.category || inferCategoryFromText(args.merchant) || 'Shopping'
  const categoryId = await findOrCreateCategory(ctx, categoryName)
  if (!categoryId) {
    return { tool: 'add_transaction', success: false, data: null, summary: `Unable to assign category "${categoryName}".` }
  }

  const direction = args.direction || 'debit'
  const date = args.date ? new Date(args.date) : new Date()

  const tx = await db.transaction.create({
    data: {
      userId: ctx.userId,
      categoryId,
      date,
      amountCents: args.amount,
      direction,
      currency: 'USD',
      merchantRaw: args.merchant,
      merchantNorm: args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      source: 'agent',
      confidence: 1.0,
      memo: args.memo || null,
    },
    include: { category: true },
  })

  // Check category budget status after adding
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budget = await db.budget.findFirst({
    where: { userId: ctx.userId, categoryId, month },
  })

  let budgetImpactStr = ''
  if (budget) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const txsInCat = await db.transaction.findMany({
      where: { userId: ctx.userId, categoryId, direction: 'debit', date: { gte: monthStart, lte: monthEnd } },
    })
    const spentSoFar = txsInCat.reduce((acc, t) => acc + t.amountCents, 0)
    const pct = Math.round((spentSoFar / budget.amountCents) * 100)
    const remaining = budget.amountCents - spentSoFar
    budgetImpactStr = `${tx.category.name} monthly spend is now ${formatUsd(spentSoFar)} of ${formatUsd(budget.amountCents)} (${pct}% used — ${remaining >= 0 ? `${formatUsd(remaining)} remaining` : 'over budget 🚨'})`
  }

  const formattedDisplay = args.displayAmount != null && args.displayCurrency && args.displayCurrency !== 'USD'
    ? `${args.displayCurrency} ${args.displayAmount.toFixed(2)} (~${formatUsd(args.amount)})`
    : formatUsd(args.amount)

  return {
    tool: 'add_transaction',
    success: true,
    data: {
      id: tx.id,
      merchant: tx.merchantRaw,
      amountCents: tx.amountCents,
      displayAmount: formattedDisplay,
      direction: tx.direction,
      category: tx.category.name,
      date: tx.date.toISOString().split('T')[0],
      budgetImpact: budgetImpactStr,
    },
    summary: `Logged ${direction === 'credit' ? 'income' : 'expense'}: "${tx.merchantRaw}" for ${formattedDisplay} in ${tx.category.name}.${budgetImpactStr ? ` (${budgetImpactStr})` : ''}`,
  }
}

async function updateTransaction(ctx: ToolContext, args: {
  transactionId?: string
  amountCents?: number
  merchant?: string
  category?: string
  displayAmount?: number
  displayCurrency?: string
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'update_transaction', success: false, data: null, summary: 'Permission denied: Viewer tier cannot update transactions.' }
  }

  let txToUpdate: any = null
  if (args.transactionId) {
    txToUpdate = await db.transaction.findUnique({
      where: { id: args.transactionId },
      include: { category: true },
    })
    if (!txToUpdate || txToUpdate.userId !== ctx.userId) txToUpdate = null
  }

  if (!txToUpdate) {
    // Find the most recent transaction created by agent or user
    txToUpdate = await db.transaction.findFirst({
      where: { userId: ctx.userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  if (!txToUpdate) {
    return { tool: 'update_transaction', success: false, data: null, summary: 'No recent transaction found to update.' }
  }

  const updateData: any = {}
  const changes: string[] = []

  if (args.amountCents && args.amountCents > 0) {
    const prevAmt = formatUsd(txToUpdate.amountCents)
    const newAmt = args.displayAmount != null && args.displayCurrency && args.displayCurrency !== 'USD'
      ? `${args.displayCurrency} ${args.displayAmount.toFixed(2)} (~${formatUsd(args.amountCents)})`
      : formatUsd(args.amountCents)
    updateData.amountCents = args.amountCents
    changes.push(`amount from ${prevAmt} to ${newAmt}`)
  }

  if (args.merchant) {
    const prevMerch = txToUpdate.merchantRaw
    updateData.merchantRaw = args.merchant
    updateData.merchantNorm = args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')
    changes.push(`merchant from "${prevMerch}" to "${args.merchant}"`)
  }

  if (args.category) {
    const catId = await findOrCreateCategory(ctx, args.category)
    if (catId) {
      const prevCat = txToUpdate.category?.name || 'General'
      updateData.categoryId = catId
      changes.push(`category from "${prevCat}" to "${args.category}"`)
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { tool: 'update_transaction', success: false, data: null, summary: 'No changes provided for the transaction.' }
  }

  const updated = await db.transaction.update({
    where: { id: txToUpdate.id },
    data: updateData,
    include: { category: true },
  })

  return {
    tool: 'update_transaction',
    success: true,
    data: {
      id: updated.id,
      merchant: updated.merchantRaw,
      amountCents: updated.amountCents,
      category: updated.category.name,
      changes: changes.join(', '),
    },
    summary: `Updated transaction "${updated.merchantRaw}": changed ${changes.join(', ')}.`,
  }
}

async function deleteTransaction(ctx: ToolContext, args: {
  merchant?: string
  amountCents?: number
  date?: string
  transactionId?: string
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'delete_transaction', success: false, data: null, summary: 'Permission denied: Viewer tier cannot delete transactions.' }
  }

  let txToDelete: any = null

  // 1. By explicit ID
  if (args.transactionId) {
    txToDelete = await db.transaction.findUnique({
      where: { id: args.transactionId },
      include: { category: true },
    })
    if (!txToDelete || txToDelete.userId !== ctx.userId) txToDelete = null
  }

  // 2. By amount or merchant
  if (!txToDelete && (args.amountCents || args.merchant)) {
    const where: any = { userId: ctx.userId }
    if (args.amountCents) {
      where.amountCents = {
        gte: Math.max(0, args.amountCents - 15),
        lte: args.amountCents + 15,
      }
    }
    if (args.merchant) {
      const norm = args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')
      where.OR = [
        { merchantNorm: { contains: norm } },
        { merchantRaw: { contains: args.merchant, mode: 'insensitive' } },
        { memo: { contains: args.merchant, mode: 'insensitive' } },
      ]
    }
    txToDelete = await db.transaction.findFirst({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  // 3. Fallback: if not found by specific filter, or no filter provided, find the most recent transaction
  if (!txToDelete) {
    txToDelete = await db.transaction.findFirst({
      where: { userId: ctx.userId, source: 'agent' },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!txToDelete) {
      txToDelete = await db.transaction.findFirst({
        where: { userId: ctx.userId },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      })
    }
  }

  if (!txToDelete) {
    return { tool: 'delete_transaction', success: false, data: null, summary: 'No matching transaction found to delete.' }
  }

  try {
    await db.transaction.delete({ where: { id: txToDelete.id } })
    const catName = txToDelete.category?.name ? ` in ${txToDelete.category.name}` : ''
    return {
      tool: 'delete_transaction',
      success: true,
      data: {
        id: txToDelete.id,
        merchant: txToDelete.merchantRaw,
        amountCents: txToDelete.amountCents,
        category: txToDelete.category?.name,
      },
      summary: `Removed transaction "${txToDelete.merchantRaw || 'Expense'}" for ${formatUsd(txToDelete.amountCents)}${catName}.`,
    }
  } catch (err: any) {
    return { tool: 'delete_transaction', success: false, data: null, summary: `Failed to delete transaction: ${err.message}` }
  }
}

async function updateBudget(ctx: ToolContext, args: {
  category: string
  amountCents: number
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'update_budget', success: false, data: null, summary: 'Permission denied: Viewer tier cannot update budgets.' }
  }
  if (!args.category || !args.amountCents || args.amountCents <= 0) {
    return { tool: 'update_budget', success: false, data: null, summary: 'Category and positive monthly amount required.' }
  }

  let cat = await db.category.findFirst({
    where: { name: { contains: args.category.trim(), mode: 'insensitive' } },
  })
  if (!cat) {
    const catId = await findOrCreateCategory(ctx, args.category.trim())
    cat = await db.category.findUnique({ where: { id: catId! } })
  }
  if (!cat) {
    return { tool: 'update_budget', success: false, data: null, summary: `Category "${args.category}" could not be created.` }
  }

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const budget = await db.budget.upsert({
    where: { userId_categoryId_month: { userId: ctx.userId, categoryId: cat.id, month } },
    update: { amountCents: args.amountCents },
    create: { userId: ctx.userId, categoryId: cat.id, month, amountCents: args.amountCents },
  })

  // Check current spend in this category
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const txs = await db.transaction.findMany({
    where: { userId: ctx.userId, categoryId: cat.id, direction: 'debit', date: { gte: monthStart, lte: monthEnd } },
  })
  const currentSpent = txs.reduce((acc, t) => acc + t.amountCents, 0)
  const pct = Math.round((currentSpent / budget.amountCents) * 100)

  return {
    tool: 'update_budget',
    success: true,
    data: {
      category: cat.name,
      amountCents: budget.amountCents,
      spentCents: currentSpent,
      percentUsed: pct,
      month,
    },
    summary: `Set ${cat.name} monthly budget to ${formatUsd(budget.amountCents)}/mo for ${month} (Current spend: ${formatUsd(currentSpent)} — ${pct}% used).`,
  }
}

async function createGoal(ctx: ToolContext, args: {
  name: string
  targetCents: number
  monthlyContributionCents?: number
  savedCents?: number
  targetDate?: string
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'create_goal', success: false, data: null, summary: 'Permission denied: Viewer tier cannot create goals.' }
  }
  if (!args.name || !args.targetCents || args.targetCents <= 0) {
    return { tool: 'create_goal', success: false, data: null, summary: 'Goal title and positive target amount required.' }
  }

  const monthly = args.monthlyContributionCents || Math.max(1000, Math.round(args.targetCents / 12))
  const goal = await db.goal.create({
    data: {
      userId: ctx.userId,
      name: args.name.trim(),
      targetCents: args.targetCents,
      savedCents: args.savedCents || 0,
      monthlyContributionCents: monthly,
      targetDate: args.targetDate ? new Date(args.targetDate) : null,
    },
  })

  const monthsToTarget = Math.ceil((goal.targetCents - goal.savedCents) / goal.monthlyContributionCents)

  return {
    tool: 'create_goal',
    success: true,
    data: {
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      monthlyContributionCents: goal.monthlyContributionCents,
      monthsToTarget,
    },
    summary: `Created savings goal "${goal.name}" — Target: ${formatUsd(goal.targetCents)}, contributing ${formatUsd(goal.monthlyContributionCents)}/mo (ETA: ~${monthsToTarget} months).`,
  }
}

async function contributeGoal(ctx: ToolContext, args: {
  goalName?: string
  goalId?: string
  amountCents: number
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'contribute_goal', success: false, data: null, summary: 'Permission denied: Viewer tier cannot update goals.' }
  }
  if (!args.amountCents || args.amountCents <= 0) {
    return { tool: 'contribute_goal', success: false, data: null, summary: 'Contribution amount must be greater than zero.' }
  }

  let goal: any = null
  if (args.goalId) {
    goal = await db.goal.findUnique({ where: { id: args.goalId } })
  } else if (args.goalName) {
    goal = await db.goal.findFirst({
      where: { userId: ctx.userId, name: { contains: args.goalName, mode: 'insensitive' } },
    })
  }
  if (!goal) {
    goal = await db.goal.findFirst({ where: { userId: ctx.userId }, orderBy: { updatedAt: 'desc' } })
  }

  if (!goal) {
    return { tool: 'contribute_goal', success: false, data: null, summary: 'No matching savings goal found.' }
  }

  const newSaved = goal.savedCents + args.amountCents
  const updated = await db.goal.update({
    where: { id: goal.id },
    data: { savedCents: newSaved },
  })

  const pct = Math.round((updated.savedCents / updated.targetCents) * 100)

  return {
    tool: 'contribute_goal',
    success: true,
    data: {
      goalId: updated.id,
      name: updated.name,
      addedCents: args.amountCents,
      savedCents: updated.savedCents,
      targetCents: updated.targetCents,
      percentComplete: pct,
    },
    summary: `Added ${formatUsd(args.amountCents)} to "${updated.name}" — progress is now ${formatUsd(updated.savedCents)} of ${formatUsd(updated.targetCents)} (${pct}%).`,
  }
}

async function categorizeMerchant(ctx: ToolContext, args: { merchant: string; category: string }): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'categorize_merchant', success: false, data: null, summary: 'Permission denied: Viewer tier cannot modify categories.' }
  }
  const cat = await db.category.findFirst({
    where: { name: { contains: args.category.trim(), mode: 'insensitive' } },
  })
  if (!cat) {
    return { tool: 'categorize_merchant', success: false, data: null, summary: `Category "${args.category}" not found.` }
  }
  const norm = args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const updated = await db.transaction.updateMany({
    where: { userId: ctx.userId, merchantNorm: { contains: norm } },
    data: { categoryId: cat.id },
  })
  return {
    tool: 'categorize_merchant',
    success: true,
    data: { merchant: args.merchant, newCategory: cat.name, count: updated.count },
    summary: `Re-categorized ${updated.count} transactions for "${args.merchant}" under ${cat.name}.`,
  }
}

// ─── Tool Registry ───────────────────────────────────────────────────────

const TOOLS: Record<string, { fn: (ctx: ToolContext, args: any) => Promise<ToolResult>; desc: string }> = {
  get_transactions: { fn: getTransactions, desc: 'Query and aggregate transactions with category/date/merchant filters' },
  get_budget: { fn: getBudget, desc: 'Retrieve current monthly budget status and category envelope usage' },
  get_insights: { fn: getInsights, desc: 'Month-over-month trends, anomaly detection, and spending shifts' },
  get_recommendations: { fn: getRecommendations, desc: 'Algorithmic savings recommendations and potential impact' },
  get_goals: { fn: getGoals, desc: 'Active savings goals and target horizon metrics' },
  run_simulation: { fn: runSimulation, desc: 'Monte Carlo stochastic simulation on goal targets' },
  categorize_merchant: { fn: categorizeMerchant, desc: 'Bulk re-categorize past merchant transactions' },
  add_transaction: { fn: addTransaction, desc: 'Record a new expense or income transaction' },
  update_transaction: { fn: updateTransaction, desc: 'Update details of a recent transaction (amount, merchant, category)' },
  delete_transaction: { fn: deleteTransaction, desc: 'Delete or undo a transaction by ID, merchant, or amount' },
  update_budget: { fn: updateBudget, desc: 'Set or adjust a category monthly budget envelope' },
  create_goal: { fn: createGoal, desc: 'Create a new savings goal with target and monthly contributions' },
  contribute_goal: { fn: contributeGoal, desc: 'Deposit funds or add contribution to a savings goal' },
}

export const WRITE_TOOL_NAMES = [
  'add_transaction',
  'update_transaction',
  'delete_transaction',
  'update_budget',
  'create_goal',
  'contribute_goal',
  'categorize_merchant',
]

// ─── Currency Extraction Helper ──────────────────────────────────────────

async function parseCurrencyAndAmount(message: string, userId: string): Promise<{
  rawAmount: number
  amountCents: number
  currencyCode: string
} | null> {
  const numMatch = message.match(/(\d+(?:\.\d{1,2})?)/)
  if (!numMatch) return null

  const rawAmount = parseFloat(numMatch[1])
  if (isNaN(rawAmount) || rawAmount <= 0) return null

  const CUR_PATTERNS: { code: string; re: RegExp }[] = [
    { code: 'BDT', re: /[৳]|\b(?:taka|bdt|tk)\b/i },
    { code: 'USD', re: /[$]|\b(?:usd|dollars?|bucks?)\b/i },
    { code: 'EUR', re: /[€]|\b(?:eur|euros?)\b/i },
    { code: 'GBP', re: /[£]|\b(?:gbp|pounds?)\b/i },
    { code: 'INR', re: /[₹]|\b(?:inr|rupees?)\b/i },
    { code: 'JPY', re: /[¥]|\b(?:jpy|yen)\b/i },
    { code: 'CAD', re: /\b(?:cad|canadian dollars?)\b/i },
    { code: 'AUD', re: /\b(?:aud|australian dollars?)\b/i },
    { code: 'CNY', re: /\b(?:cny|yuan|rmb)\b/i },
  ]

  let currencyCode = CUR_PATTERNS.find(p => p.re.test(message))?.code
  if (!currencyCode) {
    const user = await db.user.findUnique({ where: { id: userId }, include: { settings: true } })
    currencyCode = user?.settings?.currency || 'USD'
  }

  const amountCents = await convertToUsdCents(rawAmount, currencyCode)
  return { rawAmount, amountCents, currencyCode }
}

// ─── Intent Router (The Supervisor) ──────────────────────────────────────

export async function routeIntent(message: string, ctx: ToolContext): Promise<{
  mode: 'quick_qa' | 'monthly_review' | 'goal_planning' | 'write'
  tools: { name: string; args: any }[]
}> {
  const lower = message.toLowerCase().trim()

  // 1. DELETE / UNDO intent
  // Handles "delete that", "undo", "sorry i added that wrongly deleted that", "remove 20 taka", "delete coffee"
  const isDeleteIntent =
    /\b(delete|deleted|deleting|remove|removed|removing|erase|erased|undo|cancel|canceled|cancelled|revert|reverted|drop|dropped)\b/i.test(lower) &&
    (/\b(that|it|this|last|recent|entry|transaction|expense|record|purchase|one|data|item|taka|bdt|dollar|dollars|cents?)\b/i.test(lower) || /\b(wrong|wrongly|mistake|accidentally|sorry|didn.?t\s+mean)\b/i.test(lower))
    || /\b(didn.?t\s+(?:spend|buy|mean|pay)|never\s+spent|wrongly\s+added)\b/i.test(lower)
    || /^(?:delete|deleted|remove|removed|undo|cancel|revert)\b/i.test(lower)

  if (isDeleteIntent) {
    const args: any = {}
    const parsedCur = await parseCurrencyAndAmount(message, ctx.userId)
    if (parsedCur) {
      args.amountCents = parsedCur.amountCents
    }

    // Check for merchant: "delete rickshaw", "remove coffee", "delete starbucks"
    const prepMatch = message.match(/(?:\b(?:at|from|for|on|in|to)\b|@)\s+([a-zA-Z0-9\s&'-]+?)(?:\s+(?:today|yesterday|with|by)|[.,;]|$)/i)
    if (prepMatch) {
      args.merchant = prepMatch[1].replace(/^(?:a|an|the)\s+/i, '').trim()
    } else {
      const stripped = message
        .replace(/(\d+(?:\.\d{1,2})?)/g, '')
        .replace(/[৳$€£₹¥]|\b(?:sorry|i|accidentally|wrongly|wrong|added|that|please|delete|deleted|deleting|remove|removed|removing|erase|erased|undo|cancel|canceled|cancelled|revert|taka|bdt|usd|dollars?|cents?|it|this|last|transaction|expense|entry|record|purchase|one|item|data)\b/gi, '')
        .replace(/[^a-zA-Z0-9\s&'-]/g, '')
        .trim()
      if (stripped.length > 2 && !/^(?:all|everything|that|undo|it|this|wrongly|mistake)$/i.test(stripped)) {
        args.merchant = stripped
      }
    }

    return {
      mode: 'write',
      tools: [{ name: 'delete_transaction', args }],
    }
  }

  // 2. UPDATE / EDIT transaction intent: "edit last transaction to 30", "change last transaction merchant to Starbucks"
  const isEditTx = /\b(edit|change|update|modify|correct|adjust)\b/i.test(lower) &&
    (/\b(last\s+transaction|last\s+expense|last\s+entry|recent\s+transaction|previous\s+transaction)\b/i.test(lower) || (/\b(?:transaction|expense|entry)\b/i.test(lower) && /\b(?:to|as)\b/i.test(lower))) &&
    !/\b(budget|goal|envelope)\b/i.test(lower)

  if (isEditTx) {
    const args: any = {}
    const parsedCur = await parseCurrencyAndAmount(message, ctx.userId)
    if (parsedCur) {
      args.amountCents = parsedCur.amountCents
      args.displayAmount = parsedCur.rawAmount
      args.displayCurrency = parsedCur.currencyCode
    }

    const catMatch = message.match(/(?:category\s+(?:to|as)|to\s+category)\s+([a-zA-Z\s&]+)/i)
    if (catMatch) args.category = catMatch[1].trim()

    const merchMatch = message.match(/(?:merchant\s+(?:to|as)|to\s+merchant)\s+([a-zA-Z0-9\s&'-]+)/i)
    if (merchMatch) args.merchant = merchMatch[1].trim()

    return {
      mode: 'write',
      tools: [{ name: 'update_transaction', args }],
    }
  }

  // 3. GOAL CONTRIBUTION intent: "add $100 to my emergency fund goal", "deposit 200 into car goal"
  const isGoalDeposit = /\b(deposit|contribute|put|add)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s+(?:to|into|for|towards)\s+(?:my\s+)?([a-zA-Z0-9\s'-]+?)(?:\s+goal)?$/i.test(lower)
  if (isGoalDeposit) {
    const match = lower.match(/\b(?:deposit|contribute|put|add)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s+(?:to|into|for|towards)\s+(?:my\s+)?([a-zA-Z0-9\s'-]+?)(?:\s+goal)?$/i)
    if (match) {
      const rawAmt = parseFloat(match[1])
      const goalName = match[2].trim()
      const parsedCur = await parseCurrencyAndAmount(message, ctx.userId)
      const amountCents = parsedCur?.amountCents || Math.round(rawAmt * 100)
      return {
        mode: 'write',
        tools: [{ name: 'contribute_goal', args: { goalName, amountCents } }],
      }
    }
  }

  // 4. BUDGET UPDATE intent: "set dining budget to 400", "update groceries budget to $500", "budget for transport 150"
  const budgetMatch = message.match(/(?:set|update|change|adjust|make)\s+(?:my\s+)?([a-zA-Z\s]+?)\s+budget\s+(?:to|at|as|=)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
    || message.match(/(?:budget\s+(?:for|of))\s+([a-zA-Z\s]+?)\s+(?:to|at|as|=)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
  if (budgetMatch) {
    const category = budgetMatch[1].trim()
    const rawAmt = parseFloat(budgetMatch[2])
    const parsedCur = await parseCurrencyAndAmount(message, ctx.userId)
    const amountCents = parsedCur?.amountCents || Math.round(rawAmt * 100)
    return {
      mode: 'write',
      tools: [{ name: 'update_budget', args: { category, amountCents } }],
    }
  }

  // 5. GOAL CREATION intent: "create a goal to save $5000 for a car", "add savings goal Vacation target 3000"
  const isGoalCreation = /\b(?:create|add|new|start|set)\s+(?:a\s+)?(?:goal|savings?\s+goal)\b/i.test(lower)
  const goalNumMatch = message.match(/(\d+(?:\.\d{1,2})?)/)
  if (isGoalCreation && goalNumMatch) {
    const rawTarget = parseFloat(goalNumMatch[1])
    const parsedCur = await parseCurrencyAndAmount(goalNumMatch[1], ctx.userId)
    const targetCents = parsedCur?.amountCents || Math.round(rawTarget * 100)

    let name = 'Savings Goal'
    const nameMatch = message.match(/(?:for\s+a\s+|for\s+|called\s+|named\s+)([a-zA-Z0-9\s'-]+?)(?:\s+(?:target|with|contributing|\$|\d)|$)/i)
      || message.match(/(?:goal|savings?\s+goal)\s+(?:to\s+save\s+for\s+)?([a-zA-Z0-9\s'-]+?)(?:\s+(?:target|with|to\s+save|\$|\d)|$)/i)
    if (nameMatch) {
      const clean = nameMatch[1].replace(/^(?:to\s+save(?:\s+for)?|a|an|the)\s+/i, '').trim()
      if (clean && !/^\d+$/.test(clean)) {
        name = clean.charAt(0).toUpperCase() + clean.slice(1)
      }
    }

    const contribMatch = message.match(/(?:contributing|contribute)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/|per)?\s*mo/i)
    const monthlyContributionCents = contribMatch ? Math.round(parseFloat(contribMatch[1]) * 100) : undefined

    return {
      mode: 'write',
      tools: [{ name: 'create_goal', args: { name, targetCents, monthlyContributionCents } }],
    }
  }

  // 6. RE-CATEGORIZE MERCHANT intent: "categorize Uber as Transport"
  const catMatch = message.match(/(?:categorize|classify|set|tag)\s+(?:all\s+)?([A-Za-z0-9\s'-]+?)\s+(?:as|to|under)\s+([A-Za-z\s]+)/i)
  if (catMatch) {
    return {
      mode: 'write',
      tools: [{
        name: 'categorize_merchant',
        args: { merchant: catMatch[1].trim(), category: catMatch[2].trim() },
      }],
    }
  }

  // 7. ADD TRANSACTION (Expense or Income)
  const numMatch = message.match(/(\d+(?:\.\d{1,2})?)/)
  const isPlusMinus = /^[+-]\s*\$?\d+/i.test(message.trim())
  const isAddVerb = /\b(?:add|log|record|entered?|spent|spend|paid|pay|bought|buy|purchased?|earned?|received?|deposit(?:ed)?|cost|charged?|income|salary|wage|paycheck|cashback|refund)\b/i.test(message)
  const hasCurrencyWord = /[৳$€£₹¥]|\b(?:taka|bdt|usd|dollars?|eur|euros?|gbp|pounds?|inr|rupees?|cents?)\b/i.test(message)
  const questionStart = /^(?:how|what|why|when|where|which|who|did|do|does|is|are|was|were|should|would|could|will|can i|am i)\b/i.test(lower)

  const isShortExpenseFormat = Boolean(numMatch) && !questionStart && !/\b(?:budget|goal|envelope|month|year|limit)\b/i.test(lower) && (
    isPlusMinus ||
    /^[a-zA-Z\s&'-]+\s+\$?\d+(?:\.\d{1,2})?\s*(?:taka|bdt|usd|dollars?|eur|gbp)?$/i.test(lower) ||
    /^\$?\d+(?:\.\d{1,2})?\s*(?:taka|bdt|usd|dollars?|eur|gbp)?\s+[a-zA-Z\s&'-]+$/i.test(lower)
  )

  const isAddRequest = Boolean(numMatch) && !/\b(?:goal|budget|envelope)\b/i.test(message) && (isAddVerb || isPlusMinus || isShortExpenseFormat || (hasCurrencyWord && !questionStart))

  if (isAddRequest && numMatch) {
    const parsedCur = await parseCurrencyAndAmount(message, ctx.userId)
    if (parsedCur && parsedCur.amountCents > 0) {
      const isIncome = /^\+\s*\d+/i.test(message.trim()) ||
        /\b(?:received|got paid|income|deposit|salary|paycheck|bonus|freelance|cashback|refund|earnings?)\b/i.test(lower)

      let merchant = isIncome ? 'Income' : 'General Expense'
      const prepMatch = message.match(/(?:\b(?:at|from|for|on|in|to)\b|@)\s+([a-zA-Z0-9\s&'-]+?)(?:\s+(?:today|yesterday|with|by)|[.,;]|$)/i)

      let extractedFromPrep: string | null = null
      if (prepMatch) {
        const clean = prepMatch[1].replace(/^(?:a|an|the)\s+/i, '').trim()
        if (clean && !/^(?:\$?\d+|\d+\s*(?:usd|dollars?|bdt|taka|eur|gbp))$/i.test(clean) && !/^(?:category|budget|envelope)$/i.test(clean)) {
          extractedFromPrep = clean.charAt(0).toUpperCase() + clean.slice(1)
        }
      }

      if (extractedFromPrep) {
        merchant = extractedFromPrep
      } else {
        const stripped = message
          .replace(/^[+-]/, '')
          .replace(/(?:for|at|on|in|from|@)\s+\$?\d+(?:\.\d{1,2})?\s*(?:usd|dollars?|bdt|taka|eur|gbp|inr)?/gi, '')
          .replace(/(\d+(?:\.\d{1,2})?)/g, '')
          .replace(/[৳$€£₹¥]/g, '')
          .replace(/\b(?:add|log|record|spent|spend|paid|pay|bought|buy|purchased?|taka|bdt|usd|dollars?|eur|gbp|inr|cents?|for|at|on|in|from|a|an|the)\b/gi, '')
          .trim()
        if (stripped.length >= 2) {
          merchant = stripped.charAt(0).toUpperCase() + stripped.slice(1)
        }
      }

      const category = isIncome ? 'Income' : (inferCategoryFromText(message) || inferCategoryFromText(merchant) || 'Shopping')

      return {
        mode: 'write',
        tools: [{
          name: 'add_transaction',
          args: {
            amount: parsedCur.amountCents,
            merchant,
            category,
            direction: isIncome ? 'credit' : 'debit',
            memo: `Added via agent: "${message}"`,
            displayAmount: parsedCur.rawAmount,
            displayCurrency: parsedCur.currencyCode,
          },
        }],
      }
    }
  }

  // 8. EXPORT intent
  if (/\b(?:export|download|csv|backup)\b/i.test(lower) && /\b(?:data|transactions?|report|expenses?|records?)\b/i.test(lower)) {
    return {
      mode: 'quick_qa',
      tools: [{ name: 'get_transactions', args: { limit: 50 } }],
    }
  }

  // 9. MONTHLY REVIEW & FINANCIAL HEALTH CHECK
  if (/\b(month|review|overspend|over budget|summary|recap|breakdown|monthly|health check|audit)\b/i.test(lower)) {
    return {
      mode: 'monthly_review',
      tools: [
        { name: 'get_budget', args: {} },
        { name: 'get_insights', args: {} },
        { name: 'get_recommendations', args: {} },
        { name: 'get_transactions', args: { limit: 5 } },
      ],
    }
  }

  // 10. SAVINGS ADVICE & RECOMMENDATIONS
  if (/\b(?:recommends?|recommendations?|advice|suggest(?:ion)?s?|tips?|save\s+money|cut\s+costs?|reduce\s+spending)\b/i.test(lower)) {
    return {
      mode: 'quick_qa',
      tools: [
        { name: 'get_recommendations', args: {} },
        { name: 'get_insights', args: {} },
      ],
    }
  }

  // 11. GOAL PLANNING & SIMULATION
  if (/\b(if|when|how long|afford|simulation|forecast|project|timeline)\b/i.test(lower) && /\b(trip|fund|laptop|car|save|goal|vacation)\b/i.test(lower)) {
    return {
      mode: 'goal_planning',
      tools: [
        { name: 'get_goals', args: {} },
        { name: 'run_simulation', args: {} },
        { name: 'get_budget', args: {} },
      ],
    }
  }

  // 12. BUDGET STATUS QUERIES: "what is my budget?", "budget status", "how much budget left?"
  if (/\b(budget|budgets|envelope|envelopes|limit|limits)\b/i.test(lower)) {
    const catName = inferCategoryFromText(lower)
    return {
      mode: 'quick_qa',
      tools: [{ name: 'get_budget', args: { categoryName: catName } }],
    }
  }

  // 13. GOAL QUERIES: "show my goals", "list goals", "how are my goals doing?"
  if (/\b(goal|goals|target|savings?)\b/i.test(lower)) {
    return {
      mode: 'quick_qa',
      tools: [{ name: 'get_goals', args: {} }],
    }
  }

  // 14. CATEGORY-SPECIFIC SPENDING QUERIES: "how much did I spend on food?", "dining expenses"
  const categoryMatched = inferCategoryFromText(lower)
  if (categoryMatched && /\b(spend|spent|spending|cost|expenses?)\b/i.test(lower)) {
    return {
      mode: 'quick_qa',
      tools: [
        { name: 'get_transactions', args: { categoryName: categoryMatched, limit: 30 } },
        { name: 'get_budget', args: { categoryName: categoryMatched } },
      ],
    }
  }

  // 15. GENERAL SPENDING / TRANSACTION INQUIRIES
  if (/\b(spend|spent|spending|transaction|transactions|history|expenses?|purchases?)\b/i.test(lower)) {
    return {
      mode: 'quick_qa',
      tools: [{ name: 'get_transactions', args: { limit: 20 } }],
    }
  }

  // 16. GREETINGS & HELP
  const isGreeting = /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening))\b/i.test(lower)
  const isHelp = /\b(?:help|what can you do|how (?:to|do i) use (?:this|you)|commands|features)\b/i.test(lower)
  if (isGreeting || isHelp) {
    return { mode: 'quick_qa', tools: [] }
  }

  // 17. Default read fallback
  return {
    mode: 'quick_qa',
    tools: [
      { name: 'get_transactions', args: { limit: 10 } },
      { name: 'get_budget', args: {} },
    ],
  }
}

// ─── Main Agent Runner ───────────────────────────────────────────────────

export async function runAgent(
  ctx: ToolContext,
  userMessage: string,
  history: { role: string; content: string }[] = [],
  options: { skipLlm?: boolean } = {}
): Promise<{ response: string; mode: string; toolResults: ToolResult[]; toolCalls: any[] }> {
  // 1. Route intent (Supervisor)
  const { mode, tools } = await routeIntent(userMessage, ctx)

  // 2. Execute tools (Workers)
  const toolResults: ToolResult[] = []
  const toolCalls: any[] = []

  for (const t of tools) {
    const tool = TOOLS[t.name]
    if (!tool) continue
    let result: ToolResult
    try {
      result = await tool.fn(ctx, t.args)
    } catch (err: any) {
      console.error(`Tool ${t.name} failed:`, err)
      result = {
        tool: t.name,
        success: false,
        data: null,
        summary: `Tool failed: ${err.message}`,
      }
    }
    toolResults.push(result)
    toolCalls.push({ name: t.name, args: t.args, success: result.success, summary: result.summary })
  }

  // 3. For WRITE operations: return immediate, verified executive confirmation
  if (mode === 'write') {
    const response = buildWriteResponse(userMessage, toolResults)
    return { response, mode, toolResults, toolCalls }
  }

  // 4. Conversational greeting or help
  if (tools.length === 0) {
    const response = buildGreetingResponse()
    return { response, mode, toolResults, toolCalls }
  }

  // 5. Special export handler
  if (/\b(?:export|download|csv)\b/i.test(userMessage.toLowerCase())) {
    const response = buildExportResponse(toolResults)
    return { response, mode, toolResults, toolCalls }
  }

  // 6. If privacy mode or skipLlm
  if (options.skipLlm || ctx.privacyMode) {
    const response = buildFallbackResponse(userMessage, mode, toolResults)
    return { response, mode, toolResults, toolCalls }
  }

  // 7. Natural language synthesis via LLM with structured fallback
  const systemPrompt = `You are FinWise, a premier AI Wealth Advisor and CFO copilot.
Your job is to provide accurate, concise, executive-level financial intelligence citing exact numbers and categories from the provided tool results.
Format responses cleanly with bold metrics, bullet points, and actionable next steps.
TOOL RESULTS (JSON):
${JSON.stringify(toolResults.map(r => ({ tool: r.tool, summary: r.summary, data: r.data })), null, 2)}`

  let response: string
  try {
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      include: { settings: true },
    })
    const llmProvider = (user?.settings as any)?.llmProvider || process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'free'))
    const llmApiKey = (user?.settings as any)?.llmApiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
    const llmModel = (user?.settings as any)?.llmModel || process.env.LLM_MODEL || ''

    if (llmProvider === 'openai' && llmApiKey) {
      const model = llmModel || 'gpt-4o'
      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmApiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })
      const apiData = await apiRes.json()
      response = apiData.choices?.[0]?.message?.content || buildFallbackResponse(userMessage, mode, toolResults)
    } else if (llmProvider === 'anthropic' && llmApiKey) {
      const model = llmModel || 'claude-3-5-sonnet-20241022'
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': llmApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          max_tokens: 1000,
          messages: [
            ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: userMessage },
          ],
        }),
      })
      const apiData = await apiRes.json()
      response = apiData.content?.[0]?.text || buildFallbackResponse(userMessage, mode, toolResults)
    } else {
      try {
        response = await runFreeLLM({ systemPrompt, history, userMessage })
      } catch {
        response = buildFallbackResponse(userMessage, mode, toolResults)
      }
    }
  } catch {
    response = buildFallbackResponse(userMessage, mode, toolResults)
  }

  return { response, mode, toolResults, toolCalls }
}

// ─── Response Builders ───────────────────────────────────────────────────

function buildWriteResponse(_userMessage: string, results: ToolResult[]): string {
  const ok = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  const sections: string[] = []

  for (const r of ok) {
    if (r.tool === 'add_transaction') {
      const d = r.data
      const icon = d.direction === 'credit' ? '💰' : '💳'
      const typeLabel = d.direction === 'credit' ? 'Income' : 'Expense'
      let s = `${icon} **Transaction Recorded Successfully**\n\n`
      s += `• **Description:** ${d.merchant}\n`
      s += `• **Amount:** ${d.displayAmount || formatUsd(d.amountCents)} (${typeLabel})\n`
      s += `• **Category:** ${d.category}\n`
      s += `• **Date:** ${d.date}\n`
      if (d.budgetImpact) {
        s += `• **Budget Status:** ${d.budgetImpact}\n`
      }
      s += `\n*Need to revert this? Just say **"undo"** or **"delete that"**.*`
      sections.push(s)
    } else if (r.tool === 'delete_transaction') {
      const d = r.data
      let s = `🗑️ **Transaction Removed**\n\n`
      s += `• **Entry:** "${d.merchant}" (${formatUsd(d.amountCents)})\n`
      if (d.category) s += `• **Category:** ${d.category}\n`
      s += `• **Status:** Successfully deleted. Your spending records and category limits have been recalculated.`
      sections.push(s)
    } else if (r.tool === 'update_transaction') {
      const d = r.data
      let s = `✏️ **Transaction Updated**\n\n`
      s += `• **Entry:** "${d.merchant}" (${d.category})\n`
      s += `• **Modifications:** ${d.changes}\n`
      s += `• **Status:** Saved to your records.`
      sections.push(s)
    } else if (r.tool === 'update_budget') {
      const d = r.data
      let s = `📊 **Monthly Budget Envelope Updated**\n\n`
      s += `• **Category:** ${d.category}\n`
      s += `• **New Envelope:** ${formatUsd(d.amountCents)}/month\n`
      s += `• **Current Spend:** ${formatUsd(d.spentCents)} (${d.percentUsed}% used)\n`
      s += `• **Status:** Tracking enabled for ${d.month}.`
      sections.push(s)
    } else if (r.tool === 'create_goal') {
      const d = r.data
      let s = `🎯 **Savings Goal Created**\n\n`
      s += `• **Goal Name:** ${d.name}\n`
      s += `• **Target Amount:** ${formatUsd(d.targetCents)}\n`
      s += `• **Monthly Plan:** ${formatUsd(d.monthlyContributionCents)}/mo\n`
      if (d.monthsToTarget) s += `• **Estimated Horizon:** ~${d.monthsToTarget} months\n`
      sections.push(s)
    } else if (r.tool === 'contribute_goal') {
      const d = r.data
      let s = `💰 **Goal Deposit Recorded**\n\n`
      s += `• **Goal:** "${d.name}"\n`
      s += `• **Contribution:** ${formatUsd(d.addedCents)}\n`
      s += `• **Current Progress:** ${formatUsd(d.savedCents)} of ${formatUsd(d.targetCents)} (${d.percentComplete}%)\n`
      sections.push(s)
    } else if (r.tool === 'categorize_merchant') {
      sections.push(`🏷️ **Merchant Re-categorized:** ${r.summary}`)
    } else {
      sections.push(`✅ **Action Completed:** ${r.summary}`)
    }
  }

  for (const f of failed) {
    sections.push(`⚠️ **Action Could Not Be Completed:** ${f.summary}`)
  }

  return sections.join('\n\n') || 'Action completed successfully.'
}

function buildGreetingResponse(): string {
  return `👋 **FinWise AI Wealth Copilot**

I manage your finances, track spending, and execute financial instructions directly.

### ⚡ Quick Commands You Can Type:
- 💳 **Log Expenses & Income:**
  - *"Spent 20 BDT on coffee"*
  - *"Added $45 for groceries at Walmart"*
  - *"Dinner with friends 35"*
  - *"+3500 monthly salary"*
- 🗑️ **Delete & Undo Actions:**
  - *"Delete that"*
  - *"Undo last transaction"*
  - *"Sorry I added that wrongly, delete that"*
  - *"Remove 20 taka"*
- ✏️ **Edit & Update Entries:**
  - *"Edit last transaction to $30"*
  - *"Change last transaction category to Food & Dining"*
- 📊 **Manage Category Budgets:**
  - *"Set dining budget to $400"*
  - *"Update groceries budget to 500"*
  - *"What is my budget status?"*
- 🎯 **Savings Goals:**
  - *"Create a goal to save $5000 for a car"*
  - *"Add $100 to my emergency fund goal"*
  - *"Show my goals"*
- 📈 **Audits & Analysis:**
  - *"How much did I spend this month?"*
  - *"How much did I spend on food?"*
  - *"Give me a monthly review"*
  - *"Export my transactions"*

What would you like to do?`
}

function buildExportResponse(results: ToolResult[]): string {
  const txResult = results.find(r => r.tool === 'get_transactions')
  const count = txResult?.data?.count || 0
  const dateStr = new Date().toISOString().split('T')[0]

  return `📥 **Export Financial Records**

Your financial records are prepared and ready for download:

- 📄 **[Download CSV Spreadsheet](/api/export?format=csv)**
  *Standard tabular export with dates, merchants, categories, and amounts.*
- 📊 **[Download JSON Database Backup](/api/export?format=json)**
  *Full machine-readable backup of your financial data.*

*(Total ${count} transactions included up to ${dateStr})*`
}

function buildFallbackResponse(message: string, mode: string, results: ToolResult[]): string {
  if (mode === 'write') {
    return buildWriteResponse(message, results)
  }

  if (mode === 'monthly_review') {
    const budget = results.find(r => r.tool === 'get_budget')
    const insights = results.find(r => r.tool === 'get_insights')
    const recs = results.find(r => r.tool === 'get_recommendations')
    const tx = results.find(r => r.tool === 'get_transactions')

    let out = '## 📋 Executive Monthly Financial Review\n\n'

    if (budget?.data) {
      const bData = budget.data
      const overBudget = (bData.budgets || []).filter((b: any) => b.percentUsed > 100)
      out += `### 📊 Budget Performance (${bData.month})\n`
      out += `• **Total Budgeted:** ${formatUsd(bData.totalBudgetCents)}\n`
      out += `• **Total Spent:** ${formatUsd(bData.totalSpentCents)} (${bData.overallPercent}% utilized)\n`
      out += `• **Envelopes On Track:** ${(bData.budgets || []).length - overBudget.length} / ${(bData.budgets || []).length}\n\n`

      if (overBudget.length > 0) {
        out += '**⚠️ Categories Over Budget:**\n'
        for (const b of overBudget) {
          out += `- **${b.category}**: ${formatUsd(b.spentCents)} of ${formatUsd(b.budgetCents)} (${b.percentUsed}% used)\n`
        }
        out += '\n'
      }
    }

    if (insights?.data?.anomalies && insights.data.anomalies.length > 0) {
      out += `### 🔍 Flagged Spending Anomalies (${insights.data.totalAnomalies || insights.data.anomalies.length})\n`
      for (const a of insights.data.anomalies.slice(0, 3)) {
        out += `- **${a.merchant}**: ${formatUsd(a.amountCents)} (${a.category}) on ${a.date}\n`
      }
      out += '\n'
    }

    if (recs?.data?.recommendations && recs.data.recommendations.length > 0) {
      const top = recs.data.recommendations[0]
      out += `### 💡 Primary Optimization Opportunity\n`
      out += `• **${top.title}**\n`
      out += `• *Potential Savings:* **${formatUsd(top.impactCents)}/year**\n\n`
    }

    if (tx?.data?.transactions && tx.data.transactions.length > 0) {
      out += `### 💳 Recent Activity\n`
      for (const t of tx.data.transactions.slice(0, 3)) {
        const sign = t.direction === 'credit' ? '+' : '-'
        out += `- ${t.date} · **${t.merchant}** · ${sign}${formatUsd(t.amountCents)} *(${t.category})*\n`
      }
    }

    return out
  }

  // Quick QA / General Query synthesis
  const sections: string[] = []

  for (const r of results) {
    if (!r.success) {
      sections.push(`⚠️ **${r.tool.replace(/^get_/, '').toUpperCase()}:** ${r.summary}`)
      continue
    }

    if (r.tool === 'get_transactions' && r.data?.transactions) {
      const d = r.data
      let s = `💳 **Transaction Summary (${d.count} records found)**\n\n`
      s += `• **Total Expenses:** ${formatUsd(d.totalDebitCents)}\n`
      if (d.totalCreditCents > 0) {
        s += `• **Total Income:** ${formatUsd(d.totalCreditCents)}\n`
        s += `• **Net Cashflow:** ${formatUsd(d.netSavingsCents)}\n`
      }
      s += '\n**Recent Transactions:**\n'
      if (d.transactions.length === 0) {
        s += 'No transactions found matching this query.\n'
      } else {
        for (const t of d.transactions.slice(0, 6)) {
          const sign = t.direction === 'credit' ? '+' : '-'
          s += `- **${t.date}** · ${t.merchant} · **${sign}${formatUsd(t.amountCents)}** *(${t.category})*\n`
        }
      }

      if (d.categoryBreakdown?.length > 0) {
        s += '\n**Top Category Spend:**\n'
        for (const c of d.categoryBreakdown.slice(0, 4)) {
          s += `- **${c.name}**: ${formatUsd(c.cents)} (${c.count} txs)\n`
        }
      }
      sections.push(s)
    } else if (r.tool === 'get_budget' && r.data?.budgets) {
      const d = r.data
      let s = `📊 **Monthly Budget Envelopes (${d.month})**\n\n`
      s += `• **Total Allocation:** ${formatUsd(d.totalBudgetCents)}\n`
      s += `• **Total Spent:** ${formatUsd(d.totalSpentCents)} (${d.overallPercent}%)\n\n`
      if (d.budgets.length === 0) {
        s += 'No category envelopes configured for this month. You can say *"set food budget to $400"* to establish one.'
      } else {
        for (const b of d.budgets) {
          const icon = b.status === 'Exceeded' ? '🚨' : b.status === 'Approaching Limit' ? '⚠️' : '✅'
          const filled = Math.min(10, Math.floor(b.percentUsed / 10))
          const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
          s += `• **${b.category}**: ${formatUsd(b.spentCents)} / ${formatUsd(b.budgetCents)} [${bar}] ${b.percentUsed}% ${icon}\n`
        }
      }
      sections.push(s)
    } else if (r.tool === 'get_goals' && r.data?.goals) {
      const d = r.data
      let s = `🎯 **Active Savings Goals (${d.goals.length})**\n\n`
      if (d.goals.length === 0) {
        s += 'No active savings goals tracked. Say *"create a goal to save $5000 for a car"* to start.'
      } else {
        for (const g of d.goals) {
          const filled = Math.min(10, Math.floor(g.percentComplete / 10))
          const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
          s += `• **${g.name}**: ${formatUsd(g.savedCents)} of ${formatUsd(g.targetCents)} [${bar}] ${g.percentComplete}%\n`
          s += `  *Contributing ${formatUsd(g.monthlyContributionCents)}/mo${g.monthsRemaining ? ` · ~${g.monthsRemaining} months remaining` : ''}*\n`
        }
      }
      sections.push(s)
    } else if (r.tool === 'get_recommendations' && r.data?.recommendations) {
      const d = r.data
      let s = `💡 **Financial Optimization Recommendations**\n\n`
      if (d.recommendations.length === 0) {
        s += 'No active spending alerts or recommendations at this time. All categories look well-managed!'
      } else {
        for (const rec of d.recommendations) {
          s += `• **${rec.title}**\n  *Impact:* Potential savings of **${formatUsd(rec.impactCents)}/year**\n  ${rec.description || ''}\n`
        }
      }
      sections.push(s)
    } else if (r.tool === 'run_simulation' && r.data) {
      sections.push(`📈 **Projection Simulation:**\n${r.summary}`)
    } else if (r.tool === 'get_insights' && r.data) {
      sections.push(`🔍 **Insights & Patterns:**\n${r.summary}`)
    } else {
      sections.push(r.summary)
    }
  }

  return sections.join('\n\n') || 'I analyzed your records, but no matching transactions were found.'
}
