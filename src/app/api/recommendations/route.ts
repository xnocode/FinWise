// Recommendations endpoint
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  const recs = await db.recommendation.findMany({
    where: { userId: user.id },
    orderBy: [{ status: 'asc' }, { impactCents: 'desc' }],
  })

  const totalPending = recs.filter(r => r.status === 'pending').reduce((s, r) => s + r.impactCents, 0)

  return NextResponse.json({
    ok: true,
    recommendations: recs,
    totalPendingImpactCents: totalPending,
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status } = body
    if (!id || !['accepted', 'dismissed', 'pending'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'id and valid status required' }, { status: 400 })
    }
    const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
    if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

    if (user.tier === 'Viewer') {
      return NextResponse.json({ ok: false, error: 'Viewer tier cannot modify recommendations' }, { status: 403 })
    }

    const rec = await db.recommendation.update({
      where: { id },
      data: { status },
    })
    return NextResponse.json({ ok: true, rec })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
