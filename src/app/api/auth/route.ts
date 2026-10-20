// Auth endpoint — sign up, login, logout, check session
// Uses localStorage on client + server-side user creation
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Password strength check
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 6) return { valid: false, message: 'Password must be at least 6 characters long' }
  if (password.length > 128) return { valid: false, message: 'Password is too long' }
  return { valid: true }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, email, password, name } = body

    // ─── SIGNUP ─────────────────────────────────────────────────────
    if (action === 'signup') {
      // Validate required fields
      if (!name || !name.trim()) {
        return NextResponse.json({ ok: false, error: 'Please enter your full name', field: 'name' }, { status: 400 })
      }
      if (!email || !email.trim()) {
        return NextResponse.json({ ok: false, error: 'Please enter your email address', field: 'email' }, { status: 400 })
      }
      if (!isValidEmail(email)) {
        return NextResponse.json({ ok: false, error: 'Please enter a valid email address (e.g. you@example.com)', field: 'email' }, { status: 400 })
      }
      if (!password) {
        return NextResponse.json({ ok: false, error: 'Please enter a password', field: 'password' }, { status: 400 })
      }
      const pwCheck = validatePassword(password)
      if (!pwCheck.valid) {
        return NextResponse.json({ ok: false, error: pwCheck.message!, field: 'password' }, { status: 400 })
      }

      // Check if email is already registered
      const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
      if (existing) {
        return NextResponse.json({
          ok: false,
          error: 'This email is already registered. Please sign in instead, or use a different email.',
          field: 'email',
          code: 'EMAIL_EXISTS'
        }, { status: 409 })
      }

      // Create new user — NO data seeded, starts completely empty
      const user = await db.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name.trim(),
          tier: 'Editor',
          privacyMode: false,
          settings: { create: {} },
        },
      })

      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        sessionToken: Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString('base64'),
        isNewUser: true,  // Signal to frontend: don't seed data
      })
    }

    // ─── LOGIN ──────────────────────────────────────────────────────
    if (action === 'login') {
      if (!email || !email.trim()) {
        return NextResponse.json({ ok: false, error: 'Please enter your email address', field: 'email' }, { status: 400 })
      }
      if (!password) {
        return NextResponse.json({ ok: false, error: 'Please enter your password', field: 'password' }, { status: 400 })
      }

      const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
      if (!user) {
        return NextResponse.json({
          ok: false,
          error: 'No account found with this email. Please sign up first.',
          field: 'email',
          code: 'USER_NOT_FOUND'
        }, { status: 404 })
      }

      // In production, verify password hash here
      // For demo: accept any password for existing users
      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        sessionToken: Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString('base64'),
        isNewUser: false,
      })
    }

    // ─── DEMO LOGIN ─────────────────────────────────────────────────
    if (action === 'demo') {
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
        isNewUser: false,
      })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Auth error:', err)
    // Handle Prisma unique constraint violation
    if (err.code === 'P2002') {
      return NextResponse.json({
        ok: false,
        error: 'This email is already registered. Please sign in instead.',
        field: 'email',
        code: 'EMAIL_EXISTS'
      }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred. Please try again.' }, { status: 500 })
  }
}
