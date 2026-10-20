// Onboarding endpoint — track onboarding task completion
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ONBOARDING_TASKS = [
  { id: 'explore_overview', label: 'Explore the Overview dashboard', description: 'View your financial KPIs, spending treemap, and monthly trends', view: 'overview' },
  { id: 'chat_with_agent', label: 'Chat with the FinWise Agent', description: 'Ask the AI agent a question like "How did this month go?"', view: 'overview' },
  { id: 'add_transaction', label: 'Add a transaction via the agent', description: 'Type "I spent $25 on coffee at Blue Bottle" in the chat', view: 'overview' },
  { id: 'view_budgets', label: 'Review your budgets', description: 'Check which categories are over budget and adjust allocations', view: 'budgets' },
  { id: 'run_simulation', label: 'Run a Monte Carlo simulation', description: 'Visit Goals and click "Run Monte Carlo simulation"', view: 'goals' },
  { id: 'explore_analytics', label: 'Explore Advanced Analytics', description: 'View your Financial Health Score and cash flow forecast', view: 'analytics' },
  { id: 'visit_innovation', label: 'Discover Innovation Lab', description: 'Find your Financial Personality DNA and Future Self projection', view: 'innovation' },
]

export async function GET() {
  const user = await db.user.findUnique({ where: { email: 'demo@example.com' }, include: { settings: true } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  // Get completed tasks from settings (stored as JSON string in a field)
  let settings = user.settings
  if (!settings) {
    settings = await db.userSettings.create({ data: { userId: user.id } })
  }

  // Use the displayName field hack — we'll store onboarding progress in a separate approach
  // For now, return the task list and let the client track completion in localStorage
  return NextResponse.json({
    ok: true,
    tasks: ONBOARDING_TASKS,
  })
}

export { ONBOARDING_TASKS }
