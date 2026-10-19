// Seed endpoint: generates 12 months of synthetic data for the demo user
import { NextResponse } from 'next/server'
import { seedUserData } from '@/lib/seed'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await seedUserData('demo@example.com')
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Seed error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
