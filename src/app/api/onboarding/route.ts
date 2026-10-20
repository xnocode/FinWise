// Onboarding endpoint — track onboarding task completion
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

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

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  // Get completed tasks from settings (stored as JSON string in a field)
  let settings = user.settings
  if (!settings) {
    settings = await db.userSettings.create({ data: { userId: user.id } })
  }

  let completed: string[] = []
  try {
    completed = settings.onboardingState ? JSON.parse(settings.onboardingState) : []
  } catch {
    completed = []
  }

  return NextResponse.json({
    ok: true,
    tasks: ONBOARDING_TASKS,
    completed,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => ({}))
  const completed = Array.isArray(body.completed) ? body.completed.filter((id: unknown) => typeof id === 'string') : []
  await db.userSettings.upsert({
    where: { userId: auth.user.id },
    update: { onboardingState: JSON.stringify(completed) },
    create: { userId: auth.user.id, onboardingState: JSON.stringify(completed) },
  })
  return NextResponse.json({ ok: true, completed })
}

export { ONBOARDING_TASKS }
