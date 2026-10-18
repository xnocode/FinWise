// Maya Agent — Personal Finance Copilot
// Implements a supervisor-worker pattern with tool calling
import { db } from '@/lib/db'
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
  // Just return success in this demo
  return {
    tool: 'categorize_merchant',
    success: true,
    data: { merchant: args.merchant, newCategory: args.category },
    summary: `Re-categorized "${args.merchant}" as ${args.category}`,
  }
}

// ─── Tool registry ───────────────────────────────────────────────────────

const TOOLS: Record<string, { fn: (ctx: ToolContext, args: any) => Promise<ToolResult>; desc: string }> = {
  get_transactions: { fn: getTransactions, desc: 'Query transactions with filters' },
  get_budget: { fn: getBudget, desc: 'Get current month budget status' },
  get_insights: { fn: getInsights, desc: 'Get spending insights and anomalies' },
  get_recommendations: { fn: getRecommendations, desc: 'Get ranked recommendations' },
  get_goals: { fn: getGoals, desc: 'Get savings goals' },
  run_simulation: { fn: runSimulation, desc: 'Run Monte Carlo on a savings goal' },
  categorize_merchant: { fn: categorizeMerchant, desc: 'Re-categorize a merchant' },
}

export const TOOL_SCHEMAS = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.desc,
}))

// ─── Intent router (the Supervisor) ──────────────────────────────────────

function routeIntent(message: string): {
  mode: 'quick_qa' | 'monthly_review' | 'goal_planning'
  tools: { name: string; args: any }[]
} {
  const lower = message.toLowerCase()

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
  history: { role: string; content: string }[] = []
): Promise<{ response: string; mode: string; toolResults: ToolResult[]; toolCalls: any[] }> {
  // 1. Route intent (Supervisor)
  const { mode, tools } = routeIntent(userMessage)

  // 2. Execute tools in parallel (Workers)
  const toolResults: ToolResult[] = []
  const toolCalls: any[] = []
  for (const t of tools) {
    const tool = TOOLS[t.name]
    if (!tool) continue
    const result = await tool.fn(ctx, t.args)
    toolResults.push(result)
    toolCalls.push({ name: t.name, args: t.args, success: result.success, summary: result.summary })
  }

  // 3. Build context for LLM
  const systemPrompt = `You are Maya, a personal finance copilot AI agent. Your job is to help users understand and improve their financial situation based on their transaction data, budget, and goals.

CORE PRINCIPLES:
1. Always cite specific transactions or data points as evidence. Never make up numbers.
2. Be calm, evidence-driven, and concrete. Avoid excessive positivity.
3. Never give licensed financial advice (stock picks, tax filing instructions, insurance purchase recommendations). If asked, say "That's outside my scope — please consult a licensed advisor."
4. Keep responses concise: 3-5 sentences for quick queries, 2-3 short paragraphs for monthly reviews.
5. When recommending actions, always state the dollar impact and confidence level.
6. You are operating in ${ctx.privacyMode ? 'PRIVACY MODE (PII scrubbed locally)' : 'standard mode'}.
7. User's current permission tier: ${ctx.tier}. Viewer cannot modify; Editor can modify budgets; Approver can execute transfers.

MODE: ${mode.toUpperCase().replace('_', ' ')}

You have access to the following tool results from your worker agents. Use them to answer the user's question. If the data does not contain the answer, say so honestly.

TOOL RESULTS (JSON):
${JSON.stringify(toolResults.map(r => ({ tool: r.tool, summary: r.summary, data: r.data })), null, 2)}`

  // 4. Call LLM
  let response: string
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ],
      thinking: { type: 'disabled' },
    })
    response = completion.choices[0]?.message?.content || 'I apologize, I could not process your request. Please try again.'
  } catch (err: any) {
    console.error('LLM call failed:', err.message)
    // Fallback response using tool summaries
    response = buildFallbackResponse(userMessage, mode, toolResults)
  }

  return { response, mode, toolResults, toolCalls }
}

function buildFallbackResponse(message: string, mode: string, results: ToolResult[]): string {
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
          out += `- ${b.category}: ${b.percentUsed}% used ($${(b.spentCents / 100).toFixed(0)} of $${(b.budgetCents / 100).toFixed(0)})\n`
        }
        out += '\n'
      }
    }
    if (insights?.data?.anomalies?.length > 0) {
      out += `**Anomalies flagged:** ${insights.data.totalAnomalies}\n`
      for (const a of insights.data.anomalies.slice(0, 3)) {
        out += `- ${a.merchant}: $${(a.amountCents / 100).toFixed(2)} on ${new Date(a.date).toLocaleDateString()}\n`
      }
      out += '\n'
    }
    if (recs?.data?.recommendations?.length > 0) {
      out += `**Top recommendation:** ${recs.data.recommendations[0].title} ($${(recs.data.recommendations[0].impactCents / 100).toFixed(0)}/yr savings)\n\n`
    }
    out += '_Note: LLM unavailable, showing structured tool output._'
    return out
  }
  // Default fallback
  return results.map(r => `**${r.tool}**: ${r.summary}`).join('\n\n') || 'I could not process your request.'
}
