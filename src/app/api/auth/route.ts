// Auth endpoint — sign up, login, logout, check session
// Uses localStorage on client + server-side user creation
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, email, password, name } = body

    if (action === 'signup') {
      if (!email || !password || !name) {
        return NextResponse.json({ ok: false, error: 'Name, email, and password are required' }, { status: 400 })
      }
      // Check if user exists
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json({ ok: false, error: 'An account with this email already exists' }, { status: 409 })
      }
      // Create user with default settings
      const user = await db.user.create({
        data: {
          email,
          name,
          tier: 'Editor',
          privacyMode: false,
          settings: { create: {} },
        },
      })
      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        sessionToken: Buffer.from(`${user.id}:${email}:${Date.now()}`).toString('base64'),
      })
    }

    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 })
      }
      const user = await db.user.findUnique({ where: { email } })
      if (!user) {
        return NextResponse.json({ ok: false, error: 'No account found with this email' }, { status: 404 })
      }
      // In production, verify password hash — demo just checks user exists
      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        sessionToken: Buffer.from(`${user.id}:${email}:${Date.now()}`).toString('base64'),
      })
    }

    if (action === 'demo') {
      // Quick demo login — uses the demo user
      let user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
      if (!user) {
        user = await db.user.create({
          data: { email: 'demo@example.com', name: 'Demo User', tier: 'Editor', settings: { create: {} } },
        })
      }
      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        sessionToken: Buffer.from(`${user.id}:demo@example.com:${Date.now()}`).toString('base64'),
        isDemo: true,
      })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Auth error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
