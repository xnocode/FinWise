// FinWise Agent — Personal Finance Copilot
// Implements a supervisor-worker pattern with tool calling
import { db } from '@/lib/db'
import { convertToUsdCents } from '@/lib/rates'
import { runFreeLLM } from '@/lib/free-llm'
import type { Transaction, Category, Budget, Goal, Recommendation } from '@prisma/client'

// ─── Tool implementations ───────────────────────────────────────────────

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

async function getTransactions(ctx: ToolContext, args: {
  categoryId?: string
  startDate?: string
  endDate?: string
  merchant?: string
  limit?: number
}): Promise<ToolResult> {
  const where: any = { userId: ctx.userId }
  if (args.categoryId) where.categoryId = args.categoryId
  if (args.startDate || args.endDate) {
    where.date = {}
    if (args.startDate) where.date.gte = new Date(args.startDate)
    if (args.endDate) where.date.lte = new Date(args.endDate)
  }
  if (args.merchant) {
    where.merchantNorm = { contains: args.merchant.toLowerCase() }
  }
  const txs = await db.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
    take: args.limit || 50,
  })
  const totalCents = txs.reduce((s, t) => s + (t.direction === 'debit' ? t.amountCents : -t.amountCents), 0)
  return {
    tool: 'get_transactions',
    success: true,
    data: { count: txs.length, totalCents, transactions: txs.slice(0, 10) },
    summary: `Found ${txs.length} transactions totaling $${(totalCents / 100).toFixed(2)}`,
  }
}

async function getBudget(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budgets = await db.budget.findMany({
    where: { userId: ctx.userId, month },
    include: { category: true },
  })

  // Calculate spend per category this month
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

  const budgetSummary = budgets.map(b => ({
    category: b.category.name,
    color: b.category.color,
    budgetCents: b.amountCents,
    spentCents: spendByCat[b.categoryId] || 0,
    remainingCents: b.amountCents - (spendByCat[b.categoryId] || 0),
    percentUsed: Math.round(((spendByCat[b.categoryId] || 0) / b.amountCents) * 100),
  }))
  return {
    tool: 'get_budget',
    success: true,
    data: { month, budgets: budgetSummary },
    summary: `Current month budget: ${budgetSummary.length} categories tracked`,
  }
}

async function getInsights(ctx: ToolContext, args: { focusCategory?: string }): Promise<ToolResult> {
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
        date: a.date,
        merchant: a.merchantRaw,
        amountCents: a.amountCents,
        category: a.category.name,
        score: a.anomalyScore,
      })),
      totalAnomalies: anomalies.length,
    },
    summary: `Top 5 month-over-month changes plus ${anomalies.length} anomalies flagged`,
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
    summary: `${recs.length} active recommendations totaling $${(totalImpact / 100).toFixed(0)}/year potential savings`,
  }
}

async function getGoals(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
  const goals = await db.goal.findMany({ where: { userId: ctx.userId } })
  return {
    tool: 'get_goals',
    success: true,
    data: { goals },
    summary: `${goals.length} savings goals tracked`,
  }
}

async function runSimulation(ctx: ToolContext, args: {
  goalId?: string
  additionalMonthlyCents?: number
  trials?: number
}): Promise<ToolResult> {
  const goalId = args.goalId
  if (!goalId) {
    const goals = await db.goal.findMany({ where: { userId: ctx.userId } })
    return {
      tool: 'run_simulation',
      success: true,
      data: { availableGoals: goals.map(g => ({ id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents })) },
      summary: 'Please specify a goalId to simulate. Available goals listed in data.',
    }
  }
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal || goal.userId !== ctx.userId) {
    return { tool: 'run_simulation', success: false, data: null, summary: 'Goal not found' }
  }

  const additional = args.additionalMonthlyCents || 0
  const monthly = goal.monthlyContributionCents + additional
  const remaining = goal.targetCents - goal.savedCents
  const baseMonths = Math.ceil(remaining / monthly)

  // Monte Carlo: simulate income volatility and discretionary spend variance
  const trials = args.trials || 1000
  const results: number[] = []
  for (let i = 0; i < trials; i++) {
    let saved = goal.savedCents
    let months = 0
    while (saved < goal.targetCents && months < 240) {
      // Monthly contribution varies ±20% (income volatility)
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
    summary: `Monte Carlo (${trials} trials): median ${median} months, 80% confidence ${p10}-${p90} months. Projected: ${targetDate.toISOString().split('T')[0]}`,
  }
}

async function categorizeMerchant(ctx: ToolContext, args: { merchant: string; category: string }): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'categorize_merchant', success: false, data: null, summary: 'Permission denied: Viewer tier cannot modify categorizations' }
  }
  // Update all transactions with this merchant to the new category
  const cat = await db.category.findFirst({ where: { name: { contains: args.category } } })
  if (!cat) {
    return { tool: 'categorize_merchant', success: false, data: null, summary: `Category "${args.category}" not found` }
  }
  const updated = await db.transaction.updateMany({
    where: { userId: ctx.userId, merchantNorm: { contains: args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-') } },
    data: { categoryId: cat.id },
  })
  return {
    tool: 'categorize_merchant',
    success: true,
    data: { merchant: args.merchant, newCategory: args.category, updatedCount: updated.count },
    summary: `Re-categorized ${updated.count} "${args.merchant}" transactions as ${args.category}`,
  }
}

// ─── NEW: Write tools — let users add/edit data through the agent ────────

// Parse a natural-language amount like "$50", "50", "$50.00", "50 dollars"
function parseAmount(text: string): number | null {
  const match = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/)
  if (!match) return null
  return Math.round(parseFloat(match[1]) * 100)
}

// Find or guess a category from text
async function findOrCreateCategory(ctx: ToolContext, categoryText: string): Promise<string | null> {
  if (!categoryText) return null
  // Try to find an existing category by name (case-insensitive)
  const existing = await db.category.findFirst({
    where: { name: { contains: categoryText } },
  })
  if (existing) return existing.id
  // Otherwise create a new one
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16']
  const newCat = await db.category.create({
    data: {
      name: categoryText.charAt(0).toUpperCase() + categoryText.slice(1).toLowerCase(),
      color: colors[Math.floor(Math.random() * colors.length)],
    },
  })
  return newCat.id
}

async function addTransaction(ctx: ToolContext, args: {
  amount: number           // in cents (USD)
  merchant: string
  category?: string
  date?: string            // ISO date
  direction?: 'debit' | 'credit'
  memo?: string
  displayAmount?: number   // amount as the user stated it (their currency)
  displayCurrency?: string // currency the user stated (e.g. 'BDT')
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Permission denied: Viewer tier cannot add transactions' }
  }
  if (!args.amount || args.amount <= 0) {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Invalid amount — must be a positive number' }
  }
  if (!args.merchant) {
    return { tool: 'add_transaction', success: false, data: null, summary: 'Merchant name required' }
  }
  // Find or create category (default to "Shopping" if not specified)
  const categoryName = args.category || 'Shopping'
  const categoryId = await findOrCreateCategory(ctx, categoryName)
  if (!categoryId) {
    return { tool: 'add_transaction', success: false, data: null, summary: `Could not resolve category "${categoryName}"` }
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
  // Show the amount in the currency the user spoke in (fall back to USD)
  const shownAmount = args.displayAmount != null
    ? `${args.displayCurrency || 'USD'} ${args.displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${(args.amount / 100).toFixed(2)}`
  return {
    tool: 'add_transaction',
    success: true,
    data: {
      id: tx.id, merchant: tx.merchantRaw, amountCents: tx.amountCents,
      direction: tx.direction, category: tx.category.name, date: tx.date.toISOString().split('T')[0],
    },
    summary: `Added ${direction === 'credit' ? 'income' : 'expense'}: ${args.merchant} for ${shownAmount} in category ${tx.category.name}`,
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
    return { tool: 'create_goal', success: false, data: null, summary: 'Permission denied: Viewer tier cannot create goals' }
  }
  if (!args.name || !args.targetCents || args.targetCents <= 0) {
    return { tool: 'create_goal', success: false, data: null, summary: 'Goal name and positive target amount required' }
  }
  const goal = await db.goal.create({
    data: {
      userId: ctx.userId,
      name: args.name,
      targetCents: args.targetCents,
      savedCents: args.savedCents || 0,
      monthlyContributionCents: args.monthlyContributionCents || Math.round(args.targetCents / 12),  // default: 1 year plan
      targetDate: args.targetDate ? new Date(args.targetDate) : null,
    },
  })
  const monthsToTarget = goal.monthlyContributionCents > 0
    ? Math.ceil((goal.targetCents - goal.savedCents) / goal.monthlyContributionCents)
    : null
  return {
    tool: 'create_goal',
    success: true,
    data: {
      id: goal.id, name: goal.name, targetCents: goal.targetCents,
      monthlyContributionCents: goal.monthlyContributionCents, monthsToTarget,
    },
    summary: `Created goal "${goal.name}" — target $${(goal.targetCents / 100).toFixed(2)}, contributing $${(goal.monthlyContributionCents / 100).toFixed(2)}/mo${monthsToTarget ? `, ETA ${monthsToTarget} months` : ''}`,
  }
}

async function updateBudget(ctx: ToolContext, args: {
  category: string
  amountCents: number      // new monthly envelope
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'update_budget', success: false, data: null, summary: 'Permission denied: Viewer tier cannot modify budgets' }
  }
  if (!args.category || !args.amountCents) {
    return { tool: 'update_budget', success: false, data: null, summary: 'Category name and amount required' }
  }
  const cat = await db.category.findFirst({ where: { name: { contains: args.category } } })
  if (!cat) {
    return { tool: 'update_budget', success: false, data: null, summary: `Category "${args.category}" not found` }
  }
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budget = await db.budget.upsert({
    where: { userId_categoryId_month: { userId: ctx.userId, categoryId: cat.id, month } },
    update: { amountCents: args.amountCents },
    create: { userId: ctx.userId, categoryId: cat.id, month, amountCents: args.amountCents },
  })
  return {
    tool: 'update_budget',
    success: true,
    data: { category: cat.name, amountCents: budget.amountCents, month },
    summary: `Updated ${cat.name} budget to $${(budget.amountCents / 100).toFixed(2)}/mo for ${month}`,
  }
}

async function deleteTransaction(ctx: ToolContext, args: {
  merchant?: string
  amountCents?: number
  date?: string
  transactionId?: string
}): Promise<ToolResult> {
  if (ctx.tier === 'Viewer') {
    return { tool: 'delete_transaction', success: false, data: null, summary: 'Permission denied: Viewer tier cannot delete transactions' }
  }
  // If specific ID provided
  if (args.transactionId) {
    try {
      await db.transaction.delete({ where: { id: args.transactionId } })
      return { tool: 'delete_transaction', success: true, data: { id: args.transactionId }, summary: `Deleted transaction ${args.transactionId}` }
    } catch {
      return { tool: 'delete_transaction', success: false, data: null, summary: `Transaction ${args.transactionId} not found` }
    }
  }
  // Find by merchant + amount + date
  const where: any = { userId: ctx.userId }
  if (args.merchant) where.merchantNorm = { contains: args.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-') }
  if (args.amountCents) where.amountCents = args.amountCents
  if (args.date) {
    const d = new Date(args.date)
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    where.date = { gte: d, lt: next }
  }
  const found = await db.transaction.findMany({ where, take: 5 })
  if (found.length === 0) {
    return { tool: 'delete_transaction', success: false, data: null, summary: 'No matching transactions found' }
  }
  if (found.length > 1) {
    return {
      tool: 'delete_transaction',
      success: false,
      data: { matches: found.map(t => ({ id: t.id, merchant: t.merchantRaw, amountCents: t.amountCents, date: t.date })) },
      summary: `Found ${found.length} matching transactions — please specify which one to delete by ID`,
    }
  }
  await db.transaction.delete({ where: { id: found[0].id } })
  return {
    tool: 'delete_transaction',
    success: true,
    data: { id: found[0].id, merchant: found[0].merchantRaw, amountCents: found[0].amountCents },
    summary: `Deleted transaction: ${found[0].merchantRaw} for $${(found[0].amountCents / 100).toFixed(2)}`,
  }
}

// ─── Tool registry ───────────────────────────────────────────────────────

const TOOLS: Record<string, { fn: (ctx: ToolContext, args: any) => Promise<ToolResult>; desc: string }> = {
  // Read tools
  get_transactions: { fn: getTransactions, desc: 'Query transactions with filters' },
  get_budget: { fn: getBudget, desc: 'Get current month budget status' },
  get_insights: { fn: getInsights, desc: 'Get spending insights and anomalies' },
  get_recommendations: { fn: getRecommendations, desc: 'Get ranked recommendations' },
  get_goals: { fn: getGoals, desc: 'Get savings goals' },
  run_simulation: { fn: runSimulation, desc: 'Run Monte Carlo on a savings goal' },
  categorize_merchant: { fn: categorizeMerchant, desc: 'Re-categorize a merchant (write)' },
  // Write tools — let users add/edit data through the agent
  add_transaction: { fn: addTransaction, desc: 'Add a new transaction (e.g. "I spent $50 on coffee at Blue Bottle")' },
  create_goal: { fn: createGoal, desc: 'Create a new savings goal (e.g. "Create a goal to save $5000 for a car")' },
  update_budget: { fn: updateBudget, desc: 'Update a budget envelope (e.g. "Set my dining budget to $400")' },
  delete_transaction: { fn: deleteTransaction, desc: 'Delete a transaction by merchant/amount/date' },
}

export const TOOL_SCHEMAS = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.desc,
}))

export const WRITE_TOOL_NAMES = [
  'add_transaction',
  'create_goal',
  'update_budget',
  'delete_transaction',
  'categorize_merchant',
]

// ─── Intent router (the Supervisor) ──────────────────────────────────────

export async function routeIntent(message: string, ctx: ToolContext): Promise<{
  mode: 'quick_qa' | 'monthly_review' | 'goal_planning' | 'write'
  tools: { name: string; args: any }[]
}> {
  const lower = message.toLowerCase()

  // ─── WRITE intents — detect add/create/update/delete commands ────
  // Add transaction: "I spent $50 on coffee at Blue Bottle", "add 50 taka for ricksha"
  const numMatch = message.match(/(\d+(?:\.\d{1,2})?)/)
  const actionVerb = /\b(?:add|log|record)\b/i.test(message)
  const spendVerb = /\b(?:spent|spend|paid|pay|bought|buy|purchased|purchase|earned|received|deposit(?:ed)?)\b/i.test(message)
  const questionStart = /^(?:how|what|why|when|where|which|who|did|do|does|is|are|was|were|should|would|could|will)\b/i.test(message.trim())
  const isWriteRequest = Boolean(numMatch) && !/\b(?:goal|budget|envelope)\b/i.test(message) && (actionVerb || (spendVerb && !questionStart))
  if (isWriteRequest && numMatch) {
    const rawAmount = parseFloat(numMatch[1])
    // Currency: an explicit mention (৳/$/€/£/₹/¥ or name) wins, else the user's display currency
    const CUR_PATTERNS: { code: string; re: RegExp }[] = [
      { code: 'BDT', re: /[৳]|\b(?:taka|bdt)\b/i },
      { code: 'USD', re: /[$]|\b(?:usd|dollars?)\b/i },
      { code: 'EUR', re: /[€]|\b(?:eur|euros?)\b/i },
      { code: 'GBP', re: /[£]|\b(?:gbp|pounds?)\b/i },
      { code: 'INR', re: /[₹]|\b(?:inr|rupees?)\b/i },
      { code: 'JPY', re: /[¥]|\b(?:jpy|yen)\b/i },
    ]
    let fromCode = CUR_PATTERNS.find(p => p.re.test(message))?.code
    if (!fromCode) {
      const u = await db.user.findUnique({ where: { id: ctx.userId }, include: { settings: true } })
      fromCode = u?.settings?.currency || 'USD'
    }
    const amountCents = await convertToUsdCents(rawAmount, fromCode)
    // Merchant — after "at", "from", "@" or "for" — until end or terminator word
    const merchantMatch = message.match(/(?:at|from|@|for)\s+([A-Z][\w\s&'-]+?)(?:\s+(?:for|in|on|today|yesterday|contributing|with|by)|[.,;]|$)/i)
    const merchantRaw = merchantMatch && merchantMatch[1] ? merchantMatch[1].trim() : ''
    const merchant = merchantRaw && !/\b(?:category|bucket|envelope)\b/i.test(merchantRaw) ? merchantRaw : 'Unknown Merchant'
    // Smart category inference — "on X" first, then scan all words
    const categoryMap: Record<string, string> = {
      groceries: 'Groceries', grocery: 'Groceries', food: 'Groceries',
      coffee: 'Dining', lunch: 'Dining', dinner: 'Dining', dining: 'Dining', restaurant: 'Dining',
      gas: 'Transport', fuel: 'Transport', uber: 'Transport', lyft: 'Transport', transport: 'Transport',
      rickshaw: 'Transport', ricksha: 'Transport', taxi: 'Transport', bus: 'Transport', train: 'Transport',
      rent: 'Rent', utilities: 'Utilities', electric: 'Utilities',
      entertainment: 'Entertainment', movie: 'Entertainment', movies: 'Entertainment',
      shopping: 'Shopping', clothes: 'Shopping', clothing: 'Shopping',
      health: 'Health', medical: 'Health', doctor: 'Health', pharmacy: 'Health',
      subscription: 'Subscriptions', subscriptions: 'Subscriptions', netflix: 'Subscriptions', spotify: 'Subscriptions',
    }
    let category: string | undefined
    const onWord = message.match(/\bon\s+(\w+)/i)?.[1]?.toLowerCase()
    if (onWord && categoryMap[onWord]) category = categoryMap[onWord]
    if (!category) {
      for (const w of lower.match(/[a-z']+/g) || []) {
        if (categoryMap[w]) { category = categoryMap[w]; break }
      }
    }
    // Explicit category override
    const categoryMatch = message.match(/(?:in|for)\s+(?:the\s+)?(\w+)\s+(?:category|bucket|envelope)/i)
    if (categoryMatch) category = categoryMatch[1]
    // Detect income: "received $X", "got paid $X", "income of $X"
    const isIncome = /\b(received|got paid|income|deposit|salary|paycheck)\b/i.test(lower)
    return {
      mode: 'write',
      tools: [{
        name: 'add_transaction',
        args: {
          amount: amountCents,
          merchant,
          category,
          direction: isIncome ? 'credit' : 'debit',
          memo: `Added via agent: "${message}"`,
          displayAmount: rawAmount,
          displayCurrency: fromCode,
        },
      }],
    }
  }

  // Create goal: "create a goal to save $5000 for a car"
  const goalMatch = message.match(/(?:create|add|new|start)\s+(?:a\s+)?(?:goal|savings?\s+goal)[^$]*\$?\s*(\d+(?:\.\d{1,2})?)/i)
  if (goalMatch) {
    const targetCents = Math.round(parseFloat(goalMatch[1]) * 100)
    // Extract goal name — usually "for X" or "to save for X" or "called X"
    // Match until end of string, or "with", "by", "at", "contributing", "save $", or punctuation
    const nameMatch = message.match(/(?:for|called|named)\s+(?:a\s|an\s|the\s)?([A-Za-z][\w\s'-]+?)(?:\s+(?:with|by|at|contributing|save)|[.,;]|$)/i)
    const name = nameMatch ? nameMatch[1].trim() : 'New Goal'
    // Extract monthly contribution if mentioned
    const contribMatch = message.match(/(?:contributing|contribute)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/|per)?\s*mo/i)
    const monthlyContributionCents = contribMatch ? Math.round(parseFloat(contribMatch[1]) * 100) : undefined
    return {
      mode: 'write',
      tools: [{
        name: 'create_goal',
        args: { name, targetCents, monthlyContributionCents },
      }],
    }
  }

  // Update budget: "set my dining budget to $400" or "update dining budget to 400"
  const budgetMatch = message.match(/(?:set|update|change|adjust)\s+(?:my\s+)?(\w+)\s+budget\s+(?:to|at)\s+\$?\s*(\d+(?:\.\d{1,2})?)/i)
  if (budgetMatch) {
    const category = budgetMatch[1]
    const amountCents = Math.round(parseFloat(budgetMatch[2]) * 100)
    return {
      mode: 'write',
      tools: [{ name: 'update_budget', args: { category, amountCents } }],
    }
  }

  // Delete transaction: "delete my last transaction" or "remove the $50 transaction" or "i didn't spend anything delete the data" or "undo that"
  const deleteMatch = message.match(/(?:delete|remove|erase|undo)\s+(?:my\s+)?(?:last\s+)?(?:transaction|expense|purchase|that|it|the\s+data|this)/i)
  const deleteAltMatch = message.match(/(?:didn.?t\s+spend|didn.?t\s+buy|never\s+spent|remove\s+(?:the\s+)?(?:last|that|recent))/i)
  if (deleteMatch || deleteAltMatch) {
    const args: any = {}
    const amountMatch = message.match(/\$?\s*(\d+(?:\.\d{1,2})?)/)
    if (amountMatch) args.amountCents = Math.round(parseFloat(amountMatch[1]) * 100)
    const merchantMatch = message.match(/(?:at|from|@)\s+([A-Z][\w\s&'-]+)/)
    if (merchantMatch) args.merchant = merchantMatch[1].trim()
    // If no specific amount or merchant, delete the most recent agent-added transaction
    if (!args.amountCents && !args.merchant) {
      // Find the most recent transaction added by the agent
      const recent = await db.transaction.findFirst({
        where: { userId: ctx.userId, source: 'agent' },
        orderBy: { createdAt: 'desc' },
      })
      if (recent) {
        args.transactionId = recent.id
      } else {
        // No agent-added transaction — find the most recent transaction
        const anyRecent = await db.transaction.findFirst({
          where: { userId: ctx.userId },
          orderBy: { date: 'desc' },
        })
        if (anyRecent) {
          args.merchant = anyRecent.merchantRaw
          args.amountCents = anyRecent.amountCents
        }
      }
    }
    return {
      mode: 'write',
      tools: [{ name: 'delete_transaction', args }],
    }
  }

  // ─── READ intents (existing logic) ───────────────────────────────

  // Goal planning — simulation triggers
  if (/\b(if|when|how long|save|cut|afford|simulation|goal)\b/i.test(lower) && /\b(trip|fund|laptop|car|save)\b/i.test(lower)) {
    return {
      mode: 'goal_planning',
      tools: [
        { name: 'get_goals', args: {} },
        { name: 'get_budget', args: {} },
      ],
    }
  }

  // Monthly review
  if (/\b(month|review|overspend|over budget|how.*do|summary|recap)\b/i.test(lower)) {
    return {
      mode: 'monthly_review',
      tools: [
        { name: 'get_budget', args: {} },
        { name: 'get_insights', args: {} },
        { name: 'get_recommendations', args: {} },
      ],
    }
  }

  // Quick Q&A — pick tools based on keywords
  const tools: { name: string; args: any }[] = []
  if (/\b(spend|spent|spending|transaction|how much)\b/i.test(lower)) {
    tools.push({ name: 'get_transactions', args: { limit: 20 } })
  }
  if (/\b(budget|envelope|category|categories)\b/i.test(lower)) {
    tools.push({ name: 'get_budget', args: {} })
  }
  if (/\b(insight|anomal|trend|why|compare)\b/i.test(lower)) {
    tools.push({ name: 'get_insights', args: {} })
  }
  if (/\b(recommend|advice|suggest|what should)\b/i.test(lower)) {
    tools.push({ name: 'get_recommendations', args: {} })
  }
  if (/\b(goal|trip|fund|laptop|target)\b/i.test(lower)) {
    tools.push({ name: 'get_goals', args: {} })
  }
  if (tools.length === 0) {
    tools.push({ name: 'get_budget', args: {} })
    tools.push({ name: 'get_insights', args: {} })
  }
  return { mode: 'quick_qa', tools }
}

// ─── Main agent entry point ──────────────────────────────────────────────

export async function runAgent(
  ctx: ToolContext,
  userMessage: string,
  history: { role: string; content: string }[] = [],
  options: { skipLlm?: boolean } = {}
): Promise<{ response: string; mode: string; toolResults: ToolResult[]; toolCalls: any[] }> {
  // 1. Route intent (Supervisor)
  const { mode, tools } = await routeIntent(userMessage, ctx)

  // 2. Execute tools in parallel (Workers)
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

  // 3. Build context for LLM
  const systemPrompt = `You are FinWise, an intelligent personal finance copilot. Your job is to help users understand and improve their financial situation based on their transaction data, budget, and goals.

CORE PRINCIPLES:
1. Always cite specific transactions or data points as evidence. Never make up numbers.
2. Be calm, evidence-driven, and concise. Use a professional, advisory tone — like a knowledgeable financial analyst, not a chatbot.
3. Never give licensed financial advice (stock picks, tax filing instructions, insurance purchase recommendations). If asked, say "That's outside my scope — please consult a licensed financial advisor."
4. Keep responses tight: 2-4 sentences for quick queries, 2-3 short paragraphs for monthly reviews. Use bullet points when listing multiple findings.
5. When recommending actions, always state the dollar impact, the confidence level, and the underlying evidence.
6. You are operating in ${ctx.privacyMode ? 'PRIVATE MODE: do not send this conversation to a cloud LLM. Answer only from tool results.' : 'standard mode (cloud LLM may rewrite tool results)'}.
7. User's current permission tier: ${ctx.tier}. Viewer cannot modify data; Editor can modify budgets, transactions, goals, and recommendations.

YOU CAN ADD AND EDIT DATA — not just read it. The user can ask you to:
- **Add a transaction**: "I spent $50 on coffee at Blue Bottle" or "I received $2000 paycheck" or "Log a $30 expense at Shell"
- **Create a savings goal**: "Create a goal to save $5000 for a car" or "Add a goal called Wedding with target $15000 contributing $400/mo"
- **Update a budget**: "Set my dining budget to $400" or "Update my groceries budget to $500"
- **Delete a transaction**: "Delete my last transaction" or "Remove the $50 transaction at Blue Bottle"
- **Re-categorize a merchant**: "Categorize all Uber transactions as Transport"

When the user asks to add/edit data, the write tool has already been executed by the time you respond. Confirm the action was successful (or explain why it failed) using the tool result summary, then offer a relevant follow-up. For example, after adding a transaction, you might mention how it affects their budget for that category.

OUTPUT FORMAT:
- Use **bold** for key numbers and recommendations.
- Use bullet points for lists of findings.
- Use short headers (## Section) only when summarizing monthly reviews.
- Always include the dollar impact for any recommendation.

MODE: ${mode.toUpperCase().replace('_', ' ')}

You have access to the following tool results from your worker agents. Use them to answer the user's question. If the data does not contain the answer, say so honestly — never fabricate transactions or numbers.

TOOL RESULTS (JSON):
${JSON.stringify(toolResults.map(r => ({ tool: r.tool, summary: r.summary, data: r.data })), null, 2)}`

  // 4. Call LLM — supports multiple providers. Privacy mode stays on-device.
  let response: string
  if (options.skipLlm || ctx.privacyMode) {
    response = buildFallbackResponse(userMessage, mode, toolResults)
    return { response, mode, toolResults, toolCalls }
  }
  try {
    // Get user's LLM provider preference from settings
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      include: { settings: true },
    })
    const llmProvider = (user?.settings as any)?.llmProvider || 'zai'
    const llmApiKey = (user?.settings as any)?.llmApiKey || ''
    const llmModel = (user?.settings as any)?.llmModel || ''

    if (llmProvider === 'openai' && llmApiKey) {
      // ─── OpenAI compatible API ────────────────────────────────
      const model = llmModel || 'gpt-4o'
      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`,
        },
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
      response = apiData.choices?.[0]?.message?.content || 'I apologize, I could not process your request. Please try again.'
    } else if (llmProvider === 'anthropic' && llmApiKey) {
      // ─── Anthropic Claude API ─────────────────────────────────
      const model = llmModel || 'claude-3-5-sonnet-20241022'
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': llmApiKey,
          'anthropic-version': '2023-06-01',
        },
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
      response = apiData.content?.[0]?.text || 'I apologize, I could not process your request. Please try again.'
    } else if (llmProvider === 'custom' && llmApiKey) {
      // ─── Custom OpenAI-compatible endpoint ────────────────────
      const baseUrl = (user?.settings as any)?.llmBaseUrl || 'http://localhost:11434/v1'
      const model = llmModel || 'llama3.1'
      const apiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`,
        },
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
      response = apiData.choices?.[0]?.message?.content || 'I apologize, I could not process your request. Please try again.'
    } else {
      // ─── Default: free local LLM (no API key, works anywhere) ───
      try {
        response = await runFreeLLM({
          systemPrompt,
          history,
          userMessage,
        })
      } catch (freeErr: any) {
        console.error('Free LLM failed:', freeErr.message)
        response = 'I could not process your request. Please try again.'
      }
    }
  } catch (err: any) {
    console.error('LLM call failed:', err.message)
    // Fallback response using tool summaries
    response = buildFallbackResponse(userMessage, mode, toolResults)
  }

  return { response, mode, toolResults, toolCalls }
}

function buildFallbackResponse(message: string, mode: string, results: ToolResult[]): string {
  const LLM_NOTE = '\n\n_Note: running on the free local LLM (no API key). For longer replies, configure OpenAI/Anthropic in Settings → AI Agent._'

  if (mode === 'write') {
    const ok = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    let out = ''
    if (ok.length > 0) out += `**Done:** ${ok.map(r => r.summary).join('; ')}.`
    if (failed.length > 0) out += `${out ? '\n\n' : ''}**Could not complete:** ${failed.map(r => r.summary).join('; ')}.`
    return out || 'I could not complete that request.'
  }

  if (mode === 'monthly_review') {
    const budget = results.find(r => r.tool === 'get_budget')
    const insights = results.find(r => r.tool === 'get_insights')
    const recs = results.find(r => r.tool === 'get_recommendations')
    let out = '## Monthly Review\n\n'
    if (budget?.data?.budgets) {
      const overBudget = budget.data.budgets.filter((b: any) => b.percentUsed > 100)
      out += `**Budget Status:** ${budget.data.budgets.length} categories tracked. ${overBudget.length} over budget.\n\n`
      if (overBudget.length > 0) {
        out += '**Over budget:**\n'
        for (const b of overBudget) {
          out += `- **${b.category}**: ${b.percentUsed}% used ($${(b.spentCents / 100).toFixed(0)} of $${(b.budgetCents / 100).toFixed(0)})\n`
        }
        out += '\n'
      }
    }
    if ((insights?.data?.anomalies?.length ?? 0) > 0) {
      out += `**Anomalies flagged:** ${insights!.data.totalAnomalies}\n`
      for (const a of insights!.data.anomalies.slice(0, 3)) {
        out += `- ${a.merchant}: $${(a.amountCents / 100).toFixed(2)} on ${new Date(a.date).toLocaleDateString()}\n`
      }
      out += '\n'
    }
    if ((recs?.data?.recommendations?.length ?? 0) > 0) {
      out += `**Top recommendation:** ${recs!.data.recommendations[0].title} ($${(recs!.data.recommendations[0].impactCents / 100).toFixed(0)}/yr savings)\n\n`
    }
    out += '_Note: LLM unavailable, showing structured tool output._'
    return out
  }

  // quick_qa / goal_planning fallback — turn tool summaries into a readable answer
  const lines = results.map(r => {
    if (!r.success) return `- **${r.tool.replace(/^get_/, '')}** — unavailable: ${r.summary}`
    return `- ${r.summary}`
  })
  if (lines.length === 0) return 'I could not process your request. Try rephrasing.'
  return `Here's what I found:\n\n${lines.join('\n')}${LLM_NOTE}`
}
