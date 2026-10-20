import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    const { id } = await params
    const tx = await db.transaction.findUnique({ where: { id } })
    if (!tx || tx.userId !== user.id) {
      return NextResponse.json({ ok: false, error: 'Transaction not found' }, { status: 404 })
    }

    await db.transaction.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Failed to delete transaction' }, { status: 500 })
  }
}
