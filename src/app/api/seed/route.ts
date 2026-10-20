// Seed endpoint: generates 12 months of synthetic data for the logged-in user
import { NextRequest, NextResponse } from 'next/server'
import { seedUserData } from '@/lib/seed'
import { getUserEmail } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const userEmail = getUserEmail(req)
    const result = await seedUserData(userEmail)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Seed error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
