import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const items = await db.notification.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  const unread = items.filter((n) => !n.read).length
  return NextResponse.json({ ok: true, notifications: items, unread })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => ({}))
  const { id, readAll } = body

  if (readAll) {
    await db.notification.updateMany({
      where: { userId: auth.user.id, read: false },
      data: { read: true },
    })
    return NextResponse.json({ ok: true })
  }

  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  await db.notification.updateMany({
    where: { id, userId: auth.user.id },
    data: { read: true },
  })
  return NextResponse.json({ ok: true })
}
