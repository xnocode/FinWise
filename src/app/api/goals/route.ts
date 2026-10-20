// Goals endpoint
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

  const goals = await db.goal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  const enriched = goals.map(g => ({
    ...g,
    percentComplete: Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)),
    remainingCents: Math.max(0, g.targetCents - g.savedCents),
    monthsToTarget: g.targetDate
      ? Math.max(0, Math.round((g.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
      : null,
  }))

  return NextResponse.json({ ok: true, goals: enriched })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, monthlyContributionCents } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    if (user.tier === 'Viewer') {
      return NextResponse.json({ ok: false, error: 'Viewer tier cannot modify goals' }, { status: 403 })
    }

    const goal = await db.goal.update({
      where: { id },
      data: monthlyContributionCents !== undefined ? { monthlyContributionCents } : {},
    })
    return NextResponse.json({ ok: true, goal })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
