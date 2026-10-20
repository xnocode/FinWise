import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Receipt scanning is not available. Import a CSV of transactions instead.' },
    { status: 400 }
  )
}
